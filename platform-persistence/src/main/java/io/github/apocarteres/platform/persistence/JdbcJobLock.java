package io.github.apocarteres.platform.persistence;

import io.github.apocarteres.platform.persistence.internal.JobLockStore;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-DEPLOYMENT-028, REQ-PERSISTENCE-001
public final class JdbcJobLock implements JobLock {

  public static final String CATALOG = "platform-job-lock";

  private final JobLockStore store;
  private final Clock clock;
  private final String holder;

  public JdbcJobLock(JdbcClient jdbc, SqlStatements statements, Clock clock, String holder) {
    if (holder == null || holder.isBlank()) {
      throw new IllegalArgumentException("Замку нужен держатель: имя экземпляра, который берёт работу");
    }
    this.store = new JobLockStore(jdbc, statements.catalog(CATALOG));
    this.clock = clock;
    this.holder = holder;
  }

  // REQ-DATA-ACCESS-002
  @Override
  public boolean claim(String job, Duration hold) {
    if (hold == null || hold.isNegative() || hold.isZero()) {
      throw new IllegalArgumentException("Срок замка должен быть положительным: замок без срока пережил бы упавший экземпляр");
    }
    Instant now = clock.instant();
    if (store.takeHeld(job, holder, now, now.plus(hold))) {
      return true;
    }
    try {
      return store.insertNew(job, holder, now.plus(hold));
    } catch (DuplicateKeyException held) {
      return false;
    }
  }

  @Override
  public void release(String job) {
    store.release(job, holder, clock.instant());
  }
}
