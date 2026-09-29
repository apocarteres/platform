package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.core.Version;
import tools.jackson.databind.json.JsonMapper;

// REQ-DEPS-004, REQ-DEPS-005
class JacksonVersionTest {

  private static final Version FIXED = new Version(3, 1, 6, null, "tools.jackson.core", "jackson-databind");

  @Test
  @DisplayName("В сборку попадает jackson-databind не ниже исправленного 3.1.6, а не версия Spring Boot 4.0.8")
  void databindIsTheFixedOne() {
    Version resolved = JsonMapper.builder().build().version();
    assertThat(resolved.compareTo(FIXED)).as("разрешённая версия %s", resolved).isGreaterThanOrEqualTo(0);
  }
}
