package io.github.apocarteres.platform.auth.internal;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;

// REQ-AUTH-006, REQ-AUTH-008, REQ-AUTH-009, REQ-AUTH-026
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
