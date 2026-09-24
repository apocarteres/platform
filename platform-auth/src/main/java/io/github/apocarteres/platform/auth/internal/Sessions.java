package io.github.apocarteres.platform.auth.internal;

import java.util.UUID;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;

// REQ-AUTH-006, REQ-AUTH-008, REQ-AUTH-009
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
    var found = repository.findByPrincipalName(account.toString());
    int ended = 0;
    for (String id : found.keySet()) {
      if (id.equals(kept)) {
        continue;
      }
      repository.deleteById(id);
      ended++;
    }
    return ended;
  }
}
