package io.github.apocarteres.platform.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
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
}
