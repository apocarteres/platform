package io.github.apocarteres.platform.time;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MutableClockTest {

  @Test
  @DisplayName("Часы возвращают заданное значение")
  void returnsGivenInstant() {
    MutableClock clock = MutableClock.at("2026-09-07T10:15:30Z");
    assertThat(clock.instant()).isEqualTo(Instant.parse("2026-09-07T10:15:30Z"));
    assertThat(clock.millis()).isEqualTo(Instant.parse("2026-09-07T10:15:30Z").toEpochMilli());
    assertThat(clock.getZone()).isEqualTo(ZoneOffset.UTC);
  }

  @Test
  @DisplayName("Сдвиг возвращает новое значение и запоминает его")
  void advancesAndRemembers() {
    MutableClock clock = MutableClock.at("2026-09-07T10:15:30Z");
    assertThat(clock.advance(Duration.ofMinutes(90))).isEqualTo(Instant.parse("2026-09-07T11:45:30Z"));
    assertThat(clock.instant()).isEqualTo(Instant.parse("2026-09-07T11:45:30Z"));
  }

  @Test
  @DisplayName("Отрицательный сдвиг переносит время назад")
  void advancesBackwards() {
    MutableClock clock = MutableClock.at("2026-09-07T10:15:30Z");
    clock.advance(Duration.ofHours(-1));
    assertThat(clock.instant()).isEqualTo(Instant.parse("2026-09-07T09:15:30Z"));
  }

  @Test
  @DisplayName("Установка значения заменяет текущее")
  void setsInstant() {
    MutableClock clock = MutableClock.at("2026-09-07T10:15:30Z");
    clock.set(Instant.parse("2027-01-01T00:00:00Z"));
    assertThat(clock.instant()).isEqualTo(Instant.parse("2027-01-01T00:00:00Z"));
  }

  @Test
  @DisplayName("Часы с другим поясом видят те же сдвиги")
  void sharesInstantWithZonedCopy() {
    MutableClock clock = MutableClock.at("2026-09-07T10:15:30Z");
    Clock moscow = clock.withZone(ZoneId.of("Europe/Moscow"));
    clock.advance(Duration.ofSeconds(5));
    assertThat(moscow.instant()).isEqualTo(Instant.parse("2026-09-07T10:15:35Z"));
    assertThat(moscow.getZone()).isEqualTo(ZoneId.of("Europe/Moscow"));
  }

  @Test
  @DisplayName("Тот же пояс возвращает те же часы")
  void keepsIdentityForSameZone() {
    MutableClock clock = MutableClock.at("2026-09-07T10:15:30Z");
    assertThat(clock.withZone(ZoneOffset.UTC)).isSameAs(clock);
  }

  @Test
  @DisplayName("Отсутствующее значение отклоняется")
  void rejectsMissingValues() {
    MutableClock clock = MutableClock.at("2026-09-07T10:15:30Z");
    assertThatNullPointerException().isThrownBy(() -> clock.set(null));
    assertThatNullPointerException().isThrownBy(() -> clock.advance(null));
    assertThatNullPointerException().isThrownBy(() -> MutableClock.at((Instant) null));
  }
}
