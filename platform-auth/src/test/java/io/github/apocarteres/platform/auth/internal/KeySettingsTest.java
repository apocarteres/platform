package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.apocarteres.platform.auth.KeyAccess;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

// REQ-AUTH-028, REQ-AUTH-029, REQ-AUTH-033
class KeySettingsTest {

  private static final KeyAccess NOTHING = request -> false;

  @Test
  @DisplayName("Ключи включаются настройкой и требуют объявленного KeyAccess; умолчания и пределы настроек")
  void keysAreDeclaredExplicitly() {
    MockEnvironment on = new MockEnvironment().withProperty("platform.auth.keys.enabled", "true");
    assertThatThrownBy(() -> KeySettings.of(on, null)).hasMessageContaining("KeyAccess");

    KeySettings defaults = KeySettings.of(on, NOTHING);
    assertThat(defaults.maxDays()).isEqualTo(365);
    assertThat(defaults.maxPerAccount()).isEqualTo(10);
    assertThat(defaults.requestsPerMinute()).isEqualTo(60);
    assertThat(defaults.changesPerMinute()).isEqualTo(20);

    assertThatThrownBy(() -> KeySettings.of(new MockEnvironment().withProperty("platform.auth.keys.enabled", "true")
      .withProperty("platform.auth.keys.max-days", "366"), NOTHING)).hasMessageContaining("platform.auth.keys.max-days");
    assertThatThrownBy(() -> KeySettings.of(new MockEnvironment().withProperty("platform.auth.keys.enabled", "true")
      .withProperty("platform.auth.keys.max-per-account", "0"), NOTHING)).hasMessageContaining("platform.auth.keys.max-per-account");
    assertThatThrownBy(() -> KeySettings.of(new MockEnvironment().withProperty("platform.auth.keys.enabled", "true")
      .withProperty("platform.auth.keys.changes-per-minute", "0"), NOTHING)).hasMessageContaining("platform.auth.keys.changes-per-minute");
  }
}
