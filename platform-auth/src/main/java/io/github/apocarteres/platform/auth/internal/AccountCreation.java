package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Account;
import java.util.Set;
import org.springframework.security.crypto.password.PasswordEncoder;

// REQ-AUTH-003, REQ-AUTH-009
final class AccountCreation {

  private final AccountStore accounts;
  private final PasswordEncoder passwords;
  private final ProfileReader profiles;
  private final AuthSettings settings;

  AccountCreation(AccountStore accounts, PasswordEncoder passwords, ProfileReader profiles, AuthSettings settings) {
    this.accounts = accounts;
    this.passwords = passwords;
    this.profiles = profiles;
    this.settings = settings;
  }

  // REQ-AUTH-021
  Object profile(Object declared) {
    return profiles.read(declared);
  }

  Account create(String declaredEmail, String declaredPassword, Set<String> roles, boolean verified, Object declaredProfile) {
    String email = Credentials.email(declaredEmail);
    String password = Credentials.password(declaredPassword, settings);
    for (String role : roles) {
      if (!settings.roles().contains(role)) {
        throw new IllegalArgumentException("Роль " + role + " не объявлена в platform.auth.roles: " + settings.roles());
      }
    }
    Object profile = profiles.read(declaredProfile);
    Account account = accounts.insert(email, passwords.encode(password), verified, roles);
    profiles.registered(account, profile);
    return account;
  }
}
