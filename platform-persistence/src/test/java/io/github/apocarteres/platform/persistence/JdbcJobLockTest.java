package io.github.apocarteres.platform.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.apocarteres.platform.persistence.internal.ResourceSqlStatements;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-DEPLOYMENT-028, REQ-JAVA-CLOCK
class JdbcJobLockTest {

  private static final Duration HOLD = Duration.ofMinutes(10);

  private final Hands clock = new Hands(Instant.parse("2026-09-24T10:00:00Z"));
  private final SqlStatements statements = new ResourceSqlStatements(new DefaultResourceLoader());
  private JdbcClient jdbc;

  @BeforeEach
  void setUp() {
    JdbcDataSource source = new JdbcDataSource();
    source.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
    jdbc = JdbcClient.create(source);
    jdbc.sql(statements.catalog(JdbcJobLock.CATALOG).get("create-table")).update();
  }

  private JobLock instance(String name) {
    return new JdbcJobLock(jdbc, statements, clock, name);
  }

  @Test
  @DisplayName("Работу берёт один экземпляр, второй пропускает, пока замок держится")
  void oneInstanceTakesTheJob() {
    JobLock blue = instance("blue");
    JobLock green = instance("green");

    assertThat(blue.claim("digest", HOLD)).isTrue();
    assertThat(green.claim("digest", HOLD)).isFalse();
    assertThat(green.claim("cleanup", HOLD)).as("другая работа — другой замок").isTrue();
  }

  @Test
  @DisplayName("Истёкший замок берёт другой экземпляр: упавший держатель работу не запирает")
  void expiredLockPassesOn() {
    JobLock blue = instance("blue");
    JobLock green = instance("green");
    assertThat(blue.claim("digest", HOLD)).isTrue();

    clock.move(HOLD.minusSeconds(1));
    assertThat(green.claim("digest", HOLD)).isFalse();
    clock.move(Duration.ofSeconds(1));
    assertThat(green.claim("digest", HOLD)).isTrue();
    assertThat(blue.claim("digest", HOLD)).isFalse();
  }

  @Test
  @DisplayName("Держатель продлевает свой замок, а освобождённый замок сразу берёт другой")
  void holderExtendsAndReleases() {
    JobLock blue = instance("blue");
    JobLock green = instance("green");
    assertThat(blue.claim("digest", HOLD)).isTrue();
    assertThat(blue.claim("digest", HOLD)).as("повторное взятие держателем продлевает срок").isTrue();

    green.release("digest");
    assertThat(green.claim("digest", HOLD)).as("чужое освобождение замка не снимает").isFalse();

    blue.release("digest");
    assertThat(green.claim("digest", HOLD)).isTrue();
  }

  @Test
  @DisplayName("Замок без срока и без держателя не создаётся")
  void holdAndHolderAreRequired() {
    JobLock blue = instance("blue");
    assertThatThrownBy(() -> blue.claim("digest", Duration.ZERO)).hasMessageContaining("Срок замка должен быть положительным");
    assertThatThrownBy(() -> instance(" ")).hasMessageContaining("Замку нужен держатель");
  }

  // REQ-JAVA-CLOCK
  static final class Hands extends Clock {

    private Instant now;

    Hands(Instant start) {
      now = start;
    }

    void move(Duration step) {
      now = now.plus(step);
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }
}
