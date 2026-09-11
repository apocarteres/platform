package io.github.apocarteres.platform.web.errors.internal;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.github.apocarteres.platform.web.errors.ErrorCodeResolver;
import io.github.apocarteres.platform.web.errors.ErrorMessages;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.Locale;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;

// REQ-QUALITY-012
class WebErrorsAutoConfigurationTest {

  private final WebApplicationContextRunner web = new WebApplicationContextRunner()
    .withConfiguration(AutoConfigurations.of(WebErrorsAutoConfiguration.class));

  @Test
  @DisplayName("Веб-контекст поднимается и даёт совет по ошибкам с портами по умолчанию")
  void registersAdviceWithDefaults() {
    web.run(context -> {
      assertThat(context).hasSingleBean(ApiErrorAdvice.class);
      assertThat(context).hasSingleBean(ErrorCodeResolver.class);
      assertThat(context).hasSingleBean(ErrorMessages.class);
      assertThat(context.getBean(ErrorCodeResolver.class).resolve(new IllegalStateException())).isEmpty();
      assertThat(context.getBean(ErrorMessages.class)
        .detailFor(ErrorCode.of("teapot", HttpStatus.I_AM_A_TEAPOT), Locale.ROOT))
        .isEqualTo("I'm a teapot");
    });
  }

  @Test
  @DisplayName("Порты потребителя заменяют реализации по умолчанию")
  void consumerPortsWin() {
    web.withUserConfiguration(ConsumerPorts.class).run(context -> {
      assertThat(context.getBean(ErrorCodeResolver.class).resolve(new IllegalStateException()))
        .contains(ErrorCode.of("conflict", HttpStatus.CONFLICT));
      assertThat(context).hasSingleBean(ApiErrorAdvice.class);
    });
  }

  @Test
  @DisplayName("Метрики появляются только с реестром, без него совет работает")
  void metricsFollowTheRegistry() {
    web.run(context -> assertThat(context).doesNotHaveBean(ErrorMetrics.class));
    web.withUserConfiguration(Registry.class)
      .run(context -> assertThat(context).hasSingleBean(ErrorMetrics.class));
  }

  @Test
  @DisplayName("Вне веб-приложения совет по ошибкам не регистрируется")
  void skipsOutsideWebApplication() {
    new ApplicationContextRunner()
      .withConfiguration(AutoConfigurations.of(WebErrorsAutoConfiguration.class))
      .run(context -> assertThat(context).doesNotHaveBean(ApiErrorAdvice.class));
  }

  @Configuration(proxyBeanMethods = false)
  static class ConsumerPorts {

    @Bean
    ErrorCodeResolver errorCodeResolver() {
      return failure -> Optional.of(ErrorCode.of("conflict", HttpStatus.CONFLICT));
    }
  }

  @Configuration(proxyBeanMethods = false)
  static class Registry {

    @Bean
    MeterRegistry meterRegistry() {
      return new SimpleMeterRegistry();
    }
  }
}
