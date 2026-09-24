package io.github.apocarteres.platform.api.version.internal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

// REQ-CLIENT-UPDATE-005, REQ-QUALITY-012
class ApiVersionAutoConfigurationTest {

  private final WebApplicationContextRunner web = new WebApplicationContextRunner()
    .withConfiguration(AutoConfigurations.of(ApiVersionAutoConfiguration.class));

  @Test
  @DisplayName("Без минимальной версии служба не стартует и называет настройку")
  void missingMinimumStopsTheService() {
    web.run(context -> {
      assertThat(context).hasFailed();
      assertThat(context.getStartupFailure()).rootCause()
        .hasMessageContaining("platform.api.min-supported-version");
    });
  }

  @Test
  @DisplayName("Неразборчивая минимальная версия останавливает службу так же")
  void invalidMinimumStopsTheService() {
    web.withPropertyValues("platform.api.min-supported-version=3.1").run(context -> {
      assertThat(context).hasFailed();
      assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("недопустима");
    });
  }

  @Test
  @DisplayName("С минимальной версией проверка встаёт в веб-слой")
  void minimumRegistersTheCheck() {
    web.withPropertyValues("platform.api.min-supported-version=3").run(context ->
      assertThat(context).hasNotFailed().hasSingleBean(WebMvcConfigurer.class));
  }

  @Test
  @DisplayName("Вне сервлетного веб-приложения проверка не поднимается и настройки не требует")
  void nonWebContextIsUntouched() {
    new ApplicationContextRunner()
      .withConfiguration(AutoConfigurations.of(ApiVersionAutoConfiguration.class))
      .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(WebMvcConfigurer.class));
  }
}
