package io.github.apocarteres.platform.time.internal;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.apocarteres.platform.time.MutableClock;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

class TimeAutoConfigurationTest {

  private final ApplicationContextRunner runner = new ApplicationContextRunner()
    .withConfiguration(AutoConfigurations.of(TimeAutoConfiguration.class));

  @Test
  @DisplayName("Без бина потребителя регистрируются часы в UTC")
  void registersSystemClock() {
    runner.run(context -> {
      assertThat(context).hasSingleBean(Clock.class);
      assertThat(context.getBean(Clock.class).getZone()).isEqualTo(ZoneOffset.UTC);
    });
  }

  @Test
  @DisplayName("Бин потребителя имеет приоритет над автоконфигурацией")
  void consumerBeanWins() {
    runner.withUserConfiguration(TestClockConfiguration.class).run(context -> {
      assertThat(context).hasSingleBean(Clock.class);
      assertThat(context.getBean(Clock.class).instant()).isEqualTo(Instant.parse("2026-09-07T10:15:30Z"));
    });
  }

  @Configuration(proxyBeanMethods = false)
  static class TestClockConfiguration {

    @Bean
    Clock clock() {
      return MutableClock.at("2026-09-07T10:15:30Z");
    }
  }
}
