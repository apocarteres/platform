package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.RegistrationHook;
import java.util.Map;
import java.util.Set;
import org.springframework.security.crypto.password.PasswordEncoder;

// REQ-AUTH-003, REQ-AUTH-009
final class AccountCreation {

  private final AccountStore accounts;
  private final PasswordEncoder passwords;
  private final RegistrationHook hook;
  private final AuthSettings settings;

  AccountCreation(AccountStore accounts, PasswordEncoder passwords, RegistrationHook hook, AuthSettings settings) {
    this.accounts = accounts;
    this.passwords = passwords;
    this.hook = hook;
    this.settings = settings;
  }

  Account create(String declaredEmail, String declaredPassword, Set<String> roles, boolean verified, Map<String, Object> profile) {
    String email = Credentials.email(declaredEmail);
    String password = Credentials.password(declaredPassword, settings);
    for (String role : roles) {
      if (!settings.roles().contains(role)) {
        throw new IllegalArgumentException("Роль " + role + " не объявлена в platform.auth.roles: " + settings.roles());
      }
    }
    Account account = accounts.insert(email, passwords.encode(password), verified, roles);
    hook.registered(account, profile == null ? Map.of() : Map.copyOf(profile));
    return account;
  }
}
