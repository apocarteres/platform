package io.github.apocarteres.platform.auth.internal;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;

// REQ-AUTH-009
final class AdminProvisioning implements ApplicationRunner {

  private final AccountStore accounts;
  private final PasswordEncoder passwords;
  private final AuthSettings settings;

  AdminProvisioning(AccountStore accounts, PasswordEncoder passwords, AuthSettings settings) {
    this.accounts = accounts;
    this.passwords = passwords;
    this.settings = settings;
  }

  @Override
  public void run(ApplicationArguments arguments) {
    settings.admin().ifPresent(admin -> {
      String email = Credentials.email(admin.email());
      if (accounts.findByEmail(email).isPresent()) {
        return;
      }
      accounts.insert(email, passwords.encode(Credentials.password(admin.password(), settings)), true, admin.roles());
    });
  }
}
