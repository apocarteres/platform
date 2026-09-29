package io.github.apocarteres.platform.persistence.internal;

import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.StoredInstant;
import java.time.Instant;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-DEPLOYMENT-028, REQ-DATA-ACCESS-002
public final class JobLockStore {

  private final JdbcClient jdbc;
  private final SqlCatalog sql;

  public JobLockStore(JdbcClient jdbc, SqlCatalog sql) {
    this.jdbc = jdbc;
    this.sql = sql;
  }

  public boolean takeHeld(String job, String holder, Instant now, Instant until) {
    return jdbc.sql(sql.get("claim-held"))
      .param("name", job)
      .param("holder", holder)
      .param("now", StoredInstant.offsetOf(now))
      .param("until", StoredInstant.offsetOf(until))
      .update() == 1;
  }

  public boolean insertNew(String job, String holder, Instant until) {
    return jdbc.sql(sql.get("claim-new"))
      .param("name", job)
      .param("holder", holder)
      .param("until", StoredInstant.offsetOf(until))
      .update() == 1;
  }

  public void release(String job, String holder, Instant now) {
    jdbc.sql(sql.get("release"))
      .param("name", job)
      .param("holder", holder)
      .param("now", StoredInstant.offsetOf(now))
      .update();
  }
}
