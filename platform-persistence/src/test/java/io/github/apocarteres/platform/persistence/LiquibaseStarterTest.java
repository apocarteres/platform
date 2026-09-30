package io.github.apocarteres.platform.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-DATA-ACCESS-007
class LiquibaseStarterTest {

  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration
  static class Service {

    @Bean
    DataSource dataSource() {
      JdbcDataSource source = new JdbcDataSource();
      source.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
      return source;
    }
  }

  private static ConfigurableApplicationContext started(Map<String, Object> properties) {
    SpringApplication application = new SpringApplication(Service.class);
    application.setWebApplicationType(WebApplicationType.NONE);
    application.setDefaultProperties(properties);
    return application.run();
  }

  @Test
  @DisplayName("Службе с platform-persistence Liquibase приходит от ядра: главный журнал применяется при запуске без своей зависимости")
  void liquibaseComesWithTheCore() {
    try (ConfigurableApplicationContext context = started(Map.of("spring.liquibase.change-log", "classpath:platform/changelog/platform-job-lock.yaml"))) {
      long rows = JdbcClient.create(context.getBean(DataSource.class)).sql("SELECT count(*) FROM platform_job_lock").query(Long.class).single();
      assertThat(rows).isZero();
    }
  }

  @Test
  @DisplayName("Проект, ещё не перешедший на Liquibase, выключает его одной настройкой")
  void notYetMovedProjectTurnsItOff() {
    try (ConfigurableApplicationContext context = started(Map.of("spring.liquibase.enabled", "false"))) {
      assertThatThrownBy(() -> JdbcClient.create(context.getBean(DataSource.class)).sql("SELECT count(*) FROM platform_job_lock")
        .query(Long.class).single()).hasMessageContaining("platform_job_lock");
    }
  }
}
