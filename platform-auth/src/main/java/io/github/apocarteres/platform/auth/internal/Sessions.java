package io.github.apocarteres.platform.auth.internal;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;

// REQ-AUTH-006, REQ-AUTH-008, REQ-AUTH-009, REQ-AUTH-026, REQ-AUTH-046, REQ-AUTH-047
final class Sessions {

  private final FindByIndexNameSessionRepository<? extends Session> repository;

  Sessions(FindByIndexNameSessionRepository<? extends Session> repository) {
    this.repository = repository;
  }

  int terminate(UUID account) {
    return terminateExcept(account, null);
  }

  // REQ-AUTH-019
  int terminateExcept(UUID account, String kept) {
    return terminateExcept(repository, account, kept);
  }

  // REQ-AUTH-047
  static final String SIGNED_IN_ADDRESS = "platform.auth.signed-in-address";
  // REQ-AUTH-047
  static final String SIGNED_IN_AGENT = "platform.auth.signed-in-agent";
  private static final int HANDLE_LENGTH = 22;

  // REQ-AUTH-047
  record Opened(String id, Instant signedInAt, Instant lastSeenAt, String address, String agent) {
  }

  // REQ-AUTH-047
  List<Opened> opened(UUID account) {
    return opened(repository, account);
  }

  // REQ-AUTH-047
  boolean endByHandle(UUID account, String handle) {
    for (Opened one : opened(account)) {
      if (handle(one.id()).equals(handle)) {
        end(one.id());
        return true;
      }
    }
    return false;
  }

  // REQ-AUTH-047
  static String handle(String id) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(id.getBytes(StandardCharsets.UTF_8));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(digest).substring(0, HANDLE_LENGTH);
    } catch (NoSuchAlgorithmException absent) {
      throw new IllegalStateException(absent);
    }
  }

  private static <S extends Session> List<Opened> opened(FindByIndexNameSessionRepository<S> repository, UUID account) {
    return repository.findByPrincipalName(account.toString()).values().stream()
      .filter(session -> !session.isExpired())
      .map(session -> new Opened(session.getId(), signedInAt(session), session.getLastAccessedTime(),
        session.getAttribute(SIGNED_IN_ADDRESS), session.getAttribute(SIGNED_IN_AGENT)))
      .sorted(Comparator.comparing(Opened::lastSeenAt).reversed())
      .toList();
  }

  private static Instant signedInAt(Session session) {
    Object stamp = session.getAttribute(SessionLifetimeFilter.SIGNED_IN_AT);
    return stamp instanceof Long signedIn ? Instant.ofEpochMilli(signedIn) : session.getCreationTime();
  }

  // REQ-AUTH-046
  void end(String id) {
    end(repository, id);
  }

  // REQ-AUTH-026
  private static <S extends Session> void end(FindByIndexNameSessionRepository<S> repository, String id) {
    S session = repository.findById(id);
    if (session == null) {
      return;
    }
    session.setLastAccessedTime(Instant.EPOCH);
    repository.save(session);
    repository.deleteById(id);
  }

  // REQ-AUTH-026
  private static <S extends Session> int terminateExcept(FindByIndexNameSessionRepository<S> repository, UUID account, String kept) {
    Map<String, S> found = repository.findByPrincipalName(account.toString());
    int ended = 0;
    for (Map.Entry<String, S> one : found.entrySet()) {
      if (one.getKey().equals(kept)) {
        continue;
      }
      S session = one.getValue();
      session.setLastAccessedTime(Instant.EPOCH);
      repository.save(session);
      repository.deleteById(one.getKey());
      ended++;
    }
    return ended;
  }
}
