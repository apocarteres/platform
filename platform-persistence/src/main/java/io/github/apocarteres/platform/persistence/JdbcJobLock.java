package io.github.apocarteres.platform.persistence;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-DEPLOYMENT-028, REQ-PERSISTENCE-001
public final class JdbcJobLock implements JobLock {

  public static final String CATALOG = "platform-job-lock";

  private final JdbcClient jdbc;
  private final SqlCatalog sql;
  private final Clock clock;
  private final String holder;

  public JdbcJobLock(JdbcClient jdbc, SqlStatements statements, Clock clock, String holder) {
    if (holder == null || holder.isBlank()) {
      throw new IllegalArgumentException("Замку нужен держатель: имя экземпляра, который берёт работу");
    }
    this.jdbc = jdbc;
    this.sql = statements.catalog(CATALOG);
    this.clock = clock;
    this.holder = holder;
  }

  @Override
  public boolean claim(String job, Duration hold) {
    if (hold == null || hold.isNegative() || hold.isZero()) {
      throw new IllegalArgumentException("Срок замка должен быть положительным: замок без срока пережил бы упавший экземпляр");
    }
    Instant now = clock.instant();
    int taken = jdbc.sql(sql.get("claim-held"))
      .param("name", job)
      .param("holder", holder)
      .param("now", StoredInstant.offsetOf(now))
      .param("until", StoredInstant.offsetOf(now.plus(hold)))
      .update();
    if (taken == 1) {
      return true;
    }
    try {
      return jdbc.sql(sql.get("claim-new"))
        .param("name", job)
        .param("holder", holder)
        .param("until", StoredInstant.offsetOf(now.plus(hold)))
        .update() == 1;
    } catch (DuplicateKeyException held) {
      return false;
    }
  }

  @Override
  public void release(String job) {
    jdbc.sql(sql.get("release"))
      .param("name", job)
      .param("holder", holder)
      .param("now", StoredInstant.offsetOf(clock))
      .update();
  }
}
