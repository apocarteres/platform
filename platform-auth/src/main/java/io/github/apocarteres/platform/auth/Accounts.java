package io.github.apocarteres.platform.auth;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

// REQ-AUTH-009, REQ-AUTH-013
public interface Accounts {

  Optional<Account> find(UUID id);

  Optional<Account> findByEmail(String email);

  // REQ-AUTH-009
  Account create(String email, String password, Set<String> roles, boolean verified, Object profile);

  // REQ-AUTH-009
  void setPassword(UUID id, String password);

  // REQ-AUTH-009
  List<Account> search(String emailPart, int offset, int limit);

  // REQ-AUTH-009
  long count(String emailPart);

  // REQ-AUTH-023
  EmailChange changeEmail(UUID id, String email, Locale locale);

  // REQ-AUTH-024
  Removal delete(UUID id);

  void block(UUID id);

  void unblock(UUID id);

  void grant(UUID id, String role);

  void revoke(UUID id, String role);

  Purged purgeUnverified(Duration olderThan);

  int purgeTokens(Duration olderThan);
}
