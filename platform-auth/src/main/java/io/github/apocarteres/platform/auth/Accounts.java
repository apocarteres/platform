package io.github.apocarteres.platform.auth;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

// REQ-AUTH-009, REQ-AUTH-013
public interface Accounts {

  Optional<Account> find(UUID id);

  Optional<Account> findByEmail(String email);

  void block(UUID id);

  void unblock(UUID id);

  void grant(UUID id, String role);

  void revoke(UUID id, String role);

  int purgeUnverified(Duration olderThan);

  int purgeTokens(Duration olderThan);
}
