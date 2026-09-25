package io.github.apocarteres.platform.ratelimit.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

// REQ-DEPLOYMENT-030, REQ-AUTH-027
class ProductionProfileKeyTest {

  @Configuration(proxyBeanMethods = false)
  static class Nothing {
  }

  private static ConfigurableApplicationContext launchedWith(Map<String, Object> systemProperties) {
    StandardEnvironment environment = new StandardEnvironment();
    environment.getPropertySources().replace(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME,
      new MapPropertySource(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME, systemProperties));
    SpringApplication application = new SpringApplication(Nothing.class);
    application.setWebApplicationType(WebApplicationType.NONE);
    application.setEnvironment(environment);
    application.setDefaultProperties(Map.of("spring.profiles.active", "metrics", "platform.rate-limit.scale", "2"));
    return application.run();
  }

  @Test
  @DisplayName("Ключ профиля из поставки включает production, оставляет профили проекта и снимает послабления стенда")
  void deliveredKeyTurnsTheProductionProfileOn() {
    try (ConfigurableApplicationContext context = launchedWith(Map.of("spring.profiles.include", "production"))) {
      assertThat(context.getEnvironment().getActiveProfiles()).contains("production", "metrics");
      assertThatThrownBy(() -> RateLimitSettings.of(context.getEnvironment())).hasMessageContaining("production");
    }
    try (ConfigurableApplicationContext context = launchedWith(Map.of())) {
      assertThat(context.getEnvironment().getActiveProfiles()).containsExactly("metrics");
      assertThat(RateLimitSettings.of(context.getEnvironment()).scale()).isEqualTo(2);
    }
  }
}
