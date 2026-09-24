package io.github.apocarteres.platform.auth;

import java.util.Map;

// REQ-AUTH-003
public interface RegistrationHook {

  RegistrationHook NONE = (account, profile) -> { };

  void registered(Account account, Map<String, Object> profile);
}
