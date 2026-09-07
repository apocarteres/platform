package io.github.apocarteres.platform.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StoredInstantTest {

  @Test
  @DisplayName("Наносекунды отбрасываются до точности хранилища")
  void truncatesToMicroseconds() {
    Instant value = Instant.parse("2026-09-06T18:37:28.060114672Z");
    assertThat(StoredInstant.of(value)).isEqualTo(Instant.parse("2026-09-06T18:37:28.060114Z"));
  }

  @Test
  @DisplayName("Значение точности хранилища не меняется")
  void keepsMicrosecondValue() {
    Instant value = Instant.parse("2026-09-06T18:37:28.060114Z");
    assertThat(StoredInstant.of(value)).isEqualTo(value);
  }

  @Test
  @DisplayName("Отсутствующее значение остаётся отсутствующим")
  void passesNullThrough() {
    assertThat(StoredInstant.of(null)).isNull();
  }

  @Test
  @DisplayName("Момент приводится к точности хранилища и получает смещение UTC")
  void convertsToStoredOffset() {
    assertThat(StoredInstant.offsetOf(Instant.parse("2026-09-06T18:37:28.060114672Z")))
      .isEqualTo(OffsetDateTime.parse("2026-09-06T18:37:28.060114Z"));
  }

  @Test
  @DisplayName("Отсутствующий момент остаётся отсутствующим и после смещения")
  void passesNullOffsetThrough() {
    assertThat(StoredInstant.offsetOf((Instant) null)).isNull();
  }

  @Test
  @DisplayName("Часы дают момент записи в точности хранилища")
  void takesWriteTimeFromClock() {
    Clock clock = Clock.fixed(Instant.parse("2026-09-06T18:37:28.060114672Z"), ZoneOffset.UTC);
    assertThat(StoredInstant.offsetOf(clock))
      .isEqualTo(OffsetDateTime.parse("2026-09-06T18:37:28.060114Z"));
  }
}
