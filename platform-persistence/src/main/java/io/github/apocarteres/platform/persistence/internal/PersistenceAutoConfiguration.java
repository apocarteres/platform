package io.github.apocarteres.platform.persistence.internal;

import io.github.apocarteres.platform.persistence.SqlCommandWriter;
import io.github.apocarteres.platform.persistence.SqlStatements;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ResourceLoader;

// REQ-PERSISTENCE-011, REQ-PERSISTENCE-012
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
