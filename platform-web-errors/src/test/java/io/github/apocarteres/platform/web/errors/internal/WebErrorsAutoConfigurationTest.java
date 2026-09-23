package io.github.apocarteres.platform.web.errors.internal;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.github.apocarteres.platform.web.errors.ErrorCodeResolver;
import io.github.apocarteres.platform.web.errors.ErrorMessages;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.Locale;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.micrometer.metrics.autoconfigure.CompositeMeterRegistryAutoConfiguration;
import org.springframework.boot.micrometer.metrics.autoconfigure.MetricsAutoConfiguration;
import org.springframework.boot.micrometer.metrics.autoconfigure.export.simple.SimpleMetricsExportAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.ServletWebRequest;

// REQ-QUALITY-012
class WebErrorsAutoConfigurationTest {

  private final WebApplicationContextRunner web = new WebApplicationContextRunner()
    .withConfiguration(AutoConfigurations.of(WebErrorsAutoConfiguration.class));

  // REQ-API-004
  private final WebApplicationContextRunner metered = new WebApplicationContextRunner()
    .withConfiguration(AutoConfigurations.of(
      MetricsAutoConfiguration.class,
      CompositeMeterRegistryAutoConfiguration.class,
      SimpleMetricsExportAutoConfiguration.class,
      WebErrorsAutoConfiguration.class
    ));

  // REQ-API-005
  @Test
  @DisplayName("Веб-контекст поднимается и даёт совет по ошибкам с портами по умолчанию")
  void registersAdviceWithDefaults() {
    web.run(context -> {
      assertThat(context).hasSingleBean(ApiErrorAdvice.class);
      assertThat(context).hasSingleBean(ErrorCodeResolver.class);
      assertThat(context).hasSingleBean(ErrorMessages.class);
      assertThat(context.getBean(ErrorCodeResolver.class).resolve(new IllegalStateException())).isEmpty();
      assertThat(context.getBean(ErrorMessages.class)
        .detailFor(ErrorCode.of("gone", HttpStatus.GONE), Locale.ROOT))
        .isEqualTo("Gone");
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
  @DisplayName("Без реестра совет работает и ничего не пишет")
  void worksWithoutARegistry() {
    web.run(context -> {
      assertThat(context).doesNotHaveBean(MeterRegistry.class);
      assertThat(failureThrough(context).getStatusCode().value()).isEqualTo(500);
    });
  }

  // REQ-API-004
  @Test
  @DisplayName("С реестром потребителя отказ двигает счётчик api.errors")
  void countsFailuresWithARegistryFromTheConsumer() {
    web.withUserConfiguration(Registry.class).run(context -> {
      failureThrough(context);
      assertThat(countedIn(context)).isEqualTo(1);
    });
  }

  // REQ-API-004, REQ-QUALITY-015
  @Test
  @DisplayName("С реестром из автонастройки отказ двигает счётчик api.errors")
  void countsFailuresWithARegistryFromAutoConfiguration() {
    metered.run(context -> {
      failureThrough(context);
      assertThat(countedIn(context)).isEqualTo(1);
    });
  }

  private static ResponseEntity<ProblemDetail> failureThrough(ApplicationContext context) {
    return context.getBean(ApiErrorAdvice.class).onFailure(
      new IllegalStateException(),
      new ServletWebRequest(new MockHttpServletRequest("POST", "/api/things"))
    );
  }

  private static double countedIn(ApplicationContext context) {
    Counter counter = context.getBean(MeterRegistry.class).find("api.errors")
      .tag("code", "unexpected")
      .tag("status", "500")
      .counter();
    return counter == null ? 0 : counter.count();
  }

  // REQ-API-006
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
