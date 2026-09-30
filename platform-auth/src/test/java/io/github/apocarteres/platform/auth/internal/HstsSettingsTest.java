package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

// REQ-AUTH-036
class HstsSettingsTest {

  @Test
  @DisplayName("HSTS по умолчанию — год с поддоменами; срок и поддомены задаёт проект; отрицательный срок отвергается")
  void hstsIsDeclared() {
    HstsSettings defaults = HstsSettings.of(new MockEnvironment());
    assertThat(defaults.enabled()).isTrue();
    assertThat(defaults.maxAge()).isEqualTo(Duration.ofDays(365));
    assertThat(defaults.includeSubDomains()).isTrue();

    HstsSettings stand = HstsSettings.of(new MockEnvironment()
      .withProperty("platform.auth.headers.hsts.max-age", "1d")
      .withProperty("platform.auth.headers.hsts.include-sub-domains", "false"));
    assertThat(stand.maxAge()).isEqualTo(Duration.ofDays(1));
    assertThat(stand.includeSubDomains()).isFalse();

    assertThat(HstsSettings.of(new MockEnvironment().withProperty("platform.auth.headers.hsts.enabled", "false")).enabled()).isFalse();
    assertThatThrownBy(() -> HstsSettings.of(new MockEnvironment().withProperty("platform.auth.headers.hsts.max-age", "-1s")))
      .hasMessageContaining("platform.auth.headers.hsts.max-age");
  }
}
