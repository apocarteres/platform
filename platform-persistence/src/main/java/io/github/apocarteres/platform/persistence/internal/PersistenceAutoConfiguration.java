package io.github.apocarteres.platform.persistence.internal;

import io.github.apocarteres.platform.persistence.SqlCommandWriter;
import io.github.apocarteres.platform.persistence.SqlStatements;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ResourceLoader;

/**
 * Регистрирует порты слоя persistence, если потребитель не объявил свои.
 *
 * <p>{@link SqlCommandWriter} появляется только при наличии Jackson 2 на classpath:
 * зависимость объявлена optional, потребителю без Jackson 2 достаточно каталогов SQL.
 */
@AutoConfiguration
public class PersistenceAutoConfiguration {

  @Bean
  @ConditionalOnMissingBean
  public SqlStatements sqlStatements(ResourceLoader resourceLoader) {
    return new ResourceSqlStatements(resourceLoader);
  }

  @Configuration(proxyBeanMethods = false)
  @ConditionalOnClass(name = "com.fasterxml.jackson.databind.ObjectMapper")
  static class CommandWriterConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public SqlCommandWriter sqlCommandWriter() {
      return new JsonSqlCommandWriter();
    }
  }
}
