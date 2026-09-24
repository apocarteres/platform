package io.github.apocarteres.platform.support.internal;

import io.github.apocarteres.platform.support.AttachmentStore;
import io.github.apocarteres.platform.support.Expired;
import io.github.apocarteres.platform.support.SupportRetention;
import io.github.apocarteres.platform.support.internal.RequestStore.Kind;
import io.github.apocarteres.platform.support.internal.RequestStore.Side;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-SUPPORT-010, REQ-SUPPORT-011
final class RetentionService implements SupportRetention {

  private final RequestStore requests;
  private final AttachmentStore files;
  private final TransactionTemplate transactions;
  private final SupportSettings settings;
  private final Clock clock;

  RetentionService(RequestStore requests, AttachmentStore files, TransactionTemplate transactions, SupportSettings settings,
    Clock clock) {
    this.requests = requests;
    this.files = files;
    this.transactions = transactions;
    this.settings = settings;
    this.clock = clock;
  }

  // REQ-SUPPORT-010
  @Override
  public Expired purgeExpired() {
    Instant now = clock.instant();
    int attachments = expire("expire-attachments", now.minus(settings.attachmentsKept()), Kind.ATTACHMENTS_EXPIRED, now);
    int journals = expire("expire-journal", now.minus(settings.journalKept()), Kind.JOURNAL_EXPIRED, now);
    int emails = Objects.requireNonNull(transactions.execute(status -> {
      List<UUID> ids = requests.expire("expire-email", now.minus(settings.guestEmailKept()), now);
      for (UUID id : ids) {
        requests.answerLinksDropped(id);
        requests.entry(id, Kind.EMAIL_EXPIRED, Side.CORE, null, null, null, null, now);
      }
      return ids.size();
    }));
    purgeFiles(now);
    return new Expired(attachments, journals, emails);
  }

  // REQ-SUPPORT-011
  @Override
  public int erase(UUID account) {
    return erase(requests.byAuthor(account));
  }

  // REQ-SUPPORT-011
  @Override
  public int erase(String guestEmail) {
    return guestEmail == null ? 0 : erase(requests.byGuest(guestEmail.strip().toLowerCase(Locale.ROOT)));
  }

  private int erase(List<UUID> ids) {
    Instant now = clock.instant();
    int erased = Objects.requireNonNull(transactions.execute(status -> {
      int count = 0;
      for (UUID id : ids) {
        if (requests.erase(id, now)) {
          requests.answerLinksDropped(id);
          requests.entry(id, Kind.ERASED, Side.CORE, null, null, null, null, now);
          count++;
        }
      }
      return count;
    }));
    purgeFiles(now);
    return erased;
  }

  private int expire(String statement, Instant before, Kind kind, Instant now) {
    return Objects.requireNonNull(transactions.execute(status -> {
      List<UUID> ids = requests.expire(statement, before, now);
      for (UUID id : ids) {
        requests.entry(id, kind, Side.CORE, null, null, null, null, now);
      }
      return ids.size();
    }));
  }

  // REQ-SUPPORT-010, REQ-SUPPORT-011
  private void purgeFiles(Instant now) {
    for (UUID attachment : requests.attachmentsToPurge()) {
      files.delete(attachment);
      requests.attachmentPurged(attachment, now);
    }
  }
}
