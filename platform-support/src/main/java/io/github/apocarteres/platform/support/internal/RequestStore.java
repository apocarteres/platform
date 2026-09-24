package io.github.apocarteres.platform.support.internal;

import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.StoredInstant;
import io.github.apocarteres.platform.support.RequestState;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-SUPPORT-001, REQ-PERSISTENCE-001
final class RequestStore {

  enum Kind { MESSAGE, STATE, ATTACHMENTS_EXPIRED, JOURNAL_EXPIRED, EMAIL_EXPIRED, ERASED }

  enum Side { AUTHOR, OPERATOR, CORE }

  record Stored(
    UUID id, long number, UUID author, String guestEmail, String locale, String message, String snapshot, String journal,
    RequestState state, Instant createdAt, Instant updatedAt, Instant closedAt, Instant attachmentsExpiredAt,
    Instant journalExpiredAt, Instant emailExpiredAt, Instant erasedAt
  ) {

    boolean guest() {
      return author == null && erasedAt == null;
    }
  }

  record Listed(UUID id, long number, RequestState state, String message, Instant createdAt, Instant updatedAt, UUID author,
    boolean guest, boolean erased, boolean fresh) {
  }

  record Entry(Kind kind, Side side, UUID actor, String text, RequestState from, RequestState to, Instant at) {
  }

  record Attachment(UUID id, String name, String type, int size, boolean purged) {
  }

  private final JdbcClient jdbc;
  private final SqlCatalog sql;

  RequestStore(JdbcClient jdbc, SqlCatalog sql) {
    this.jdbc = jdbc;
    this.sql = sql;
  }

  long insert(UUID id, UUID author, String guestEmail, String locale, String message, String snapshot, String journal,
    Instant now) {
    return jdbc.sql(sql.get("request-insert"))
      .param("id", id)
      .param("author", author)
      .param("email", guestEmail)
      .param("locale", locale)
      .param("message", message)
      .param("snapshot", snapshot)
      .param("journal", journal)
      .param("now", StoredInstant.offsetOf(now))
      .query(Long.class)
      .single();
  }

  Optional<Stored> find(UUID id) {
    return jdbc.sql(sql.get("request-by-id")).param("id", id).query(RequestStore::stored).optional();
  }

  List<Listed> pageByAuthor(UUID author, int offset, int limit) {
    return jdbc.sql(sql.get("request-page-by-author")).param("author", author).param("offset", offset).param("limit", limit)
      .query(RequestStore::listed).list();
  }

  long countByAuthor(UUID author) {
    return jdbc.sql(sql.get("request-count-by-author")).param("author", author).query(Long.class).single();
  }

  List<Listed> pageAll(RequestState state, int offset, int limit) {
    return jdbc.sql(sql.get("request-page-all")).param("state", state == null ? null : state.name())
      .param("offset", offset).param("limit", limit).query(RequestStore::listed).list();
  }

  long countAll(RequestState state) {
    return jdbc.sql(sql.get("request-count-all")).param("state", state == null ? null : state.name()).query(Long.class).single();
  }

  // REQ-SUPPORT-007
  boolean move(UUID id, RequestState from, RequestState to, boolean operator, Instant now) {
    return jdbc.sql(sql.get("request-state"))
      .param("id", id)
      .param("from", from.name())
      .param("to", to.name())
      .param("operator", operator)
      .param("now", StoredInstant.offsetOf(now))
      .update() == 1;
  }

  void touch(UUID id, boolean operator, Instant now) {
    jdbc.sql(sql.get(operator ? "request-touch-operator" : "request-touch-author")).param("id", id)
      .param("now", StoredInstant.offsetOf(now)).update();
  }

  // REQ-SUPPORT-008
  void seenByAuthor(UUID id, UUID author, Instant now) {
    jdbc.sql(sql.get("request-seen-author")).param("id", id).param("author", author).param("now", StoredInstant.offsetOf(now)).update();
  }

  // REQ-SUPPORT-008
  void seenByOperator(UUID id, Instant now) {
    jdbc.sql(sql.get("request-seen-operator")).param("id", id).param("now", StoredInstant.offsetOf(now)).update();
  }

  long unreadByAuthor(UUID author) {
    return jdbc.sql(sql.get("request-unread-author")).param("author", author).query(Long.class).single();
  }

  long unreadByOperator() {
    return jdbc.sql(sql.get("request-unread-operator")).query(Long.class).single();
  }

  void entry(UUID request, Kind kind, Side side, UUID actor, String text, RequestState from, RequestState to, Instant now) {
    jdbc.sql(sql.get("entry-insert"))
      .param("id", UUID.randomUUID())
      .param("request", request)
      .param("kind", kind.name())
      .param("side", side.name())
      .param("actor", actor)
      .param("text", text)
      .param("from", from == null ? null : from.name())
      .param("to", to == null ? null : to.name())
      .param("now", StoredInstant.offsetOf(now))
      .update();
  }

  List<Entry> entries(UUID request) {
    return jdbc.sql(sql.get("entries-by-request")).param("request", request).query((row, index) -> new Entry(
      Kind.valueOf(row.getString("kind")),
      Side.valueOf(row.getString("side")),
      row.getObject("actor", UUID.class),
      row.getString("text"),
      state(row.getString("from_state")),
      state(row.getString("to_state")),
      instant(row, "created_at")
    )).list();
  }

  void attachment(UUID id, UUID request, String name, String type, int size, Instant now) {
    jdbc.sql(sql.get("attachment-insert")).param("id", id).param("request", request).param("name", name).param("type", type)
      .param("size", size).param("now", StoredInstant.offsetOf(now)).update();
  }

  List<Attachment> attachments(UUID request) {
    return jdbc.sql(sql.get("attachments-by-request")).param("request", request).query((row, index) -> new Attachment(
      row.getObject("id", UUID.class), row.getString("name"), row.getString("content_type"), row.getInt("size_bytes"),
      row.getObject("purged_at", OffsetDateTime.class) != null
    )).list();
  }

  // REQ-SUPPORT-010, REQ-SUPPORT-011
  List<UUID> attachmentsToPurge() {
    return jdbc.sql(sql.get("attachments-to-purge")).query(UUID.class).list();
  }

  void attachmentPurged(UUID id, Instant now) {
    jdbc.sql(sql.get("attachment-purged")).param("id", id).param("now", StoredInstant.offsetOf(now)).update();
  }

  // REQ-SUPPORT-004
  void answerLink(String digest, UUID request, Instant now, Instant expires) {
    jdbc.sql(sql.get("answer-link-insert")).param("digest", digest).param("request", request)
      .param("now", StoredInstant.offsetOf(now)).param("expires", StoredInstant.offsetOf(expires)).update();
  }

  Optional<UUID> answerLinkRequest(String digest, Instant now) {
    return jdbc.sql(sql.get("answer-link-request")).param("digest", digest).param("now", StoredInstant.offsetOf(now))
      .query(UUID.class).optional();
  }

  void answerLinksDropped(UUID request) {
    jdbc.sql(sql.get("answer-link-delete")).param("request", request).update();
  }

  // REQ-SUPPORT-010
  List<UUID> expire(String statement, Instant before, Instant now) {
    return jdbc.sql(sql.get(statement)).param("before", StoredInstant.offsetOf(before)).param("now", StoredInstant.offsetOf(now))
      .query(UUID.class).list();
  }

  // REQ-SUPPORT-011
  List<UUID> byAuthor(UUID author) {
    return jdbc.sql(sql.get("requests-by-author")).param("author", author).query(UUID.class).list();
  }

  // REQ-SUPPORT-011
  List<UUID> byGuest(String email) {
    return jdbc.sql(sql.get("requests-by-guest")).param("email", email).query(UUID.class).list();
  }

  // REQ-SUPPORT-011
  boolean erase(UUID id, Instant now) {
    boolean erased = jdbc.sql(sql.get("request-erase")).param("id", id).param("now", StoredInstant.offsetOf(now)).update() == 1;
    if (erased) {
      jdbc.sql(sql.get("entries-erase")).param("request", id).update();
    }
    return erased;
  }

  private static Stored stored(ResultSet row, int index) throws SQLException {
    return new Stored(
      row.getObject("id", UUID.class),
      row.getLong("number"),
      row.getObject("author_account", UUID.class),
      row.getString("guest_email"),
      row.getString("locale"),
      row.getString("message"),
      row.getString("snapshot"),
      row.getString("journal"),
      RequestState.valueOf(row.getString("state")),
      instant(row, "created_at"),
      instant(row, "updated_at"),
      instant(row, "closed_at"),
      instant(row, "attachments_expired_at"),
      instant(row, "journal_expired_at"),
      instant(row, "email_expired_at"),
      instant(row, "erased_at")
    );
  }

  private static Listed listed(ResultSet row, int index) throws SQLException {
    UUID author = row.getObject("author_account", UUID.class);
    boolean erased = row.getObject("erased_at", OffsetDateTime.class) != null;
    return new Listed(
      row.getObject("id", UUID.class),
      row.getLong("number"),
      RequestState.valueOf(row.getString("state")),
      row.getString("message"),
      instant(row, "created_at"),
      instant(row, "updated_at"),
      author,
      author == null && !erased,
      erased,
      row.getBoolean("fresh")
    );
  }

  private static RequestState state(String value) {
    return value == null ? null : RequestState.valueOf(value);
  }

  private static Instant instant(ResultSet row, String column) throws SQLException {
    OffsetDateTime value = row.getObject(column, OffsetDateTime.class);
    return value == null ? null : value.toInstant();
  }
}
