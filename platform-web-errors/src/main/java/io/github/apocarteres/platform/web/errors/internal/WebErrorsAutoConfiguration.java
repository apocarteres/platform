package io.github.apocarteres.platform.web.errors.internal;

import io.github.apocarteres.platform.web.errors.ErrorCodeResolver;
import io.github.apocarteres.platform.web.errors.ErrorExtensions;
import io.github.apocarteres.platform.web.errors.ErrorHeaders;
import io.github.apocarteres.platform.web.errors.ErrorMessages;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Optional;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.ProblemDetail;

// REQ-API-005, REQ-API-006
@AutoConfiguration
@ConditionalOnClass(ProblemDetail.class)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class WebErrorsAutoConfiguration {

  @Bean
  @ConditionalOnMissingBean
  public ErrorCodeResolver errorCodeResolver() {
    return new UnresolvedErrorCodes();
  }

  @Bean
  @ConditionalOnMissingBean
  public ErrorMessages errorMessages() {
    return new StatusErrorMessages();
  }

  @Bean
  @ConditionalOnMissingBean
  ApiErrorAdvice apiErrorAdvice(
    ErrorCodeResolver codes,
    ErrorMessages messages,
    ObjectProvider<ErrorExtensions> extensions,
    ObjectProvider<ErrorHeaders> headers,
    ObjectProvider<ErrorMetrics> metrics
  ) {
    return new ApiErrorAdvice(
      codes,
      messages,
      Optional.ofNullable(extensions.getIfAvailable()),
      Optional.ofNullable(headers.getIfAvailable()),
      Optional.ofNullable(metrics.getIfAvailable())
    );
  }

  @Configuration(proxyBeanMethods = false)
  @ConditionalOnClass(MeterRegistry.class)
  static class MetricsConfiguration {

    @Bean
    @ConditionalOnBean(MeterRegistry.class)
    @ConditionalOnMissingBean
    ErrorMetrics errorMetrics(MeterRegistry registry) {
      return new ErrorMetrics(registry);
    }
  }
}
