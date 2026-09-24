package io.github.apocarteres.platform.auth.internal;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-AUTH-009
final class AdminProvisioning implements ApplicationRunner {

  private final AccountStore accounts;
  private final AccountCreation creation;
  private final TransactionTemplate transactions;
  private final AuthSettings settings;

  AdminProvisioning(AccountStore accounts, AccountCreation creation, TransactionTemplate transactions, AuthSettings settings) {
    this.accounts = accounts;
    this.creation = creation;
    this.transactions = transactions;
    this.settings = settings;
  }

  @Override
  public void run(ApplicationArguments arguments) {
    settings.admin().ifPresent(admin -> {
      String email = Credentials.email(admin.email());
      if (accounts.findByEmail(email).isPresent()) {
        return;
      }
      transactions.executeWithoutResult(status -> creation.create(email, admin.password(), admin.roles(), true, admin.profile()));
    });
  }
}
