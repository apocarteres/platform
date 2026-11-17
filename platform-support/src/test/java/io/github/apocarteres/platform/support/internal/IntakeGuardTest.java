package io.github.apocarteres.platform.support.internal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

// REQ-SUPPORT-003
class IntakeGuardTest {

  @Test
  @DisplayName("Шаблон фильтра приёма учитывает префикс сервлета")
  void patternFollowsServletPath() {
    assertThat(IntakeGuard.pattern("/")).isEqualTo("/api/support/requests");
    assertThat(IntakeGuard.pattern("")).isEqualTo("/api/support/requests");
    assertThat(IntakeGuard.pattern(null)).isEqualTo("/api/support/requests");
    assertThat(IntakeGuard.pattern("/x")).isEqualTo("/x/api/support/requests");
    assertThat(IntakeGuard.pattern("/x/")).isEqualTo("/x/api/support/requests");
    assertThat(IntakeGuard.pattern("x")).isEqualTo("/x/api/support/requests");
  }
}
