package io.github.apocarteres.platform.persistence.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.SqlCommandWriter;
import io.github.apocarteres.platform.persistence.SqlStatements;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

class PersistenceAutoConfigurationTest {

  private final ApplicationContextRunner runner = new ApplicationContextRunner()
    .withConfiguration(AutoConfigurations.of(PersistenceAutoConfiguration.class));

  @Test
  @DisplayName("Без бинов потребителя регистрируются каталог SQL и writer команд")
  void registersDefaultPorts() {
    runner.run(context -> {
      assertThat(context).hasSingleBean(SqlStatements.class).hasSingleBean(SqlCommandWriter.class);
      assertThat(context.getBean(SqlStatements.class).catalog("loader-valid").get("count-players"))
        .contains("count(*)");
      var json = context.getBean(SqlCommandWriter.class)
        .write(new Command(OffsetDateTime.of(2026, 9, 6, 12, 0, 0, 0, ZoneOffset.UTC)));
      assertThat(json).isEqualTo("{\"at\":\"2026-09-06T12:00:00Z\"}");
    });
  }

  @Test
  @DisplayName("Бин потребителя имеет приоритет над автоконфигурацией")
  void consumerBeanWins() {
    runner.withUserConfiguration(ConsumerConfiguration.class).run(context -> {
      assertThat(context).hasSingleBean(SqlStatements.class);
      assertThat(context.getBean(SqlStatements.class)).isInstanceOf(ConsumerStatements.class);
    });
  }

  @Test
  @DisplayName("Без Jackson 2 на classpath writer команд не регистрируется, каталоги остаются")
  void skipsWriterWithoutJackson() {
    runner.withClassLoader(new FilteredClassLoader(ObjectMapper.class)).run(context -> {
      assertThat(context).hasSingleBean(SqlStatements.class).doesNotHaveBean(SqlCommandWriter.class);
    });
  }

  record Command(OffsetDateTime at) {
  }

  static final class ConsumerStatements implements SqlStatements {
    @Override
    public SqlCatalog catalog(String directory) {
      throw new UnsupportedOperationException();
    }
  }

  @Configuration(proxyBeanMethods = false)
  static class ConsumerConfiguration {
    @Bean
    SqlStatements sqlStatements() {
      return new ConsumerStatements();
    }
  }
}
