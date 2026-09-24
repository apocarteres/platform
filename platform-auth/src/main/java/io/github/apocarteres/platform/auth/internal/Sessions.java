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
    var found = repository.findByPrincipalName(account.toString());
    found.keySet().forEach(repository::deleteById);
    return found.size();
  }
}
