package io.github.apocarteres.platform.support.internal;

import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.ModuleApiAccess;
import io.github.apocarteres.platform.persistence.SqlStatements;
import io.github.apocarteres.platform.ratelimit.RateLimiter;
import io.github.apocarteres.platform.support.AttachmentStore;
import io.github.apocarteres.platform.support.GuestIntake;
import io.github.apocarteres.platform.support.SupportLetters;
import io.github.apocarteres.platform.support.SupportRetention;
import jakarta.servlet.MultipartConfigElement;
import java.time.Clock;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.servlet.HandlerExceptionResolver;

// REQ-SUPPORT-001, REQ-SUPPORT-002, REQ-SUPPORT-003, REQ-AUTH-022
@AutoConfiguration(afterName = {
  "io.github.apocarteres.platform.auth.internal.AuthAutoConfiguration",
  "io.github.apocarteres.platform.persistence.internal.PersistenceAutoConfiguration",
  "io.github.apocarteres.platform.time.internal.TimeAutoConfiguration",
  "io.github.apocarteres.platform.ratelimit.internal.RateLimitAutoConfiguration",
  "org.springframework.boot.servlet.autoconfigure.MultipartAutoConfiguration",
})
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SupportAutoConfiguration {

  static final String CATALOG = "platform-support";

  @Bean
  SupportSettings supportSettings(Environment environment, ObjectProvider<MultipartConfigElement> multipart) {
    multipart.ifAvailable(SupportAutoConfiguration::requireRoom);
    return SupportSettings.of(environment);
  }

  // REQ-SUPPORT-003
  static void requireRoom(MultipartConfigElement multipart) {
    if (multipart.getMaxFileSize() >= 0 && multipart.getMaxFileSize() < SupportLimits.ATTACHMENT_BYTES) {
      throw new IllegalStateException("Настройка spring.servlet.multipart.max-file-size: " + multipart.getMaxFileSize()
        + " байт меньше вложения центра поддержки (" + SupportLimits.ATTACHMENT_BYTES + " байт) — вложение откажет раньше центра");
    }
    if (multipart.getMaxRequestSize() >= 0 && multipart.getMaxRequestSize() < SupportLimits.BODY_BYTES) {
      throw new IllegalStateException("Настройка spring.servlet.multipart.max-request-size: " + multipart.getMaxRequestSize()
        + " байт меньше предела обращения (" + SupportLimits.BODY_BYTES + " байт) — предел точки проверяет центр");
    }
  }

  @Bean
  RequestStore supportRequests(DataSource source, SqlStatements statements) {
    return new RequestStore(JdbcClient.create(source), statements.catalog(CATALOG));
  }

  // REQ-SUPPORT-005
  @Bean
  @ConditionalOnMissingBean(AttachmentStore.class)
  AttachmentStore supportAttachments(DataSource source, SqlStatements statements) {
    return new DatabaseAttachmentStore(JdbcClient.create(source), statements.catalog(CATALOG));
  }

  @Bean
  SupportService supportService(RequestStore requests, AttachmentStore files, Accounts accounts, RateLimiter limiter,
    SupportLetters letters, PlatformTransactionManager transactions, SupportSettings settings, Clock clock) {
    return new SupportService(requests, files, accounts, limiter, letters, new TransactionTemplate(transactions), settings, clock);
  }

  // REQ-SUPPORT-010, REQ-SUPPORT-011
  @Bean
  SupportRetention supportRetention(RequestStore requests, AttachmentStore files, PlatformTransactionManager transactions,
    SupportSettings settings, Clock clock) {
    return new RetentionService(requests, files, new TransactionTemplate(transactions), settings, clock);
  }

  // REQ-SUPPORT-002
  @Bean
  SupportController supportController(SupportService support, GuestIntake intake, SupportSettings settings) {
    return new SupportController(support, intake, settings);
  }

  // REQ-SUPPORT-002, REQ-AUTH-022
  @Bean
  ModuleApiAccess supportAccess(SupportSettings settings) {
    return rules -> {
      rules.requestMatchers(HttpMethod.POST, IntakeGuard.PATH, "/api/support/answer").permitAll();
      rules.requestMatchers(HttpMethod.GET, "/api/support/policy").permitAll();
      rules.requestMatchers("/api/support/operator/**").hasRole(settings.operatorRole());
      rules.requestMatchers("/api/support/**").authenticated();
    };
  }

  // REQ-SUPPORT-003
  @Bean
  FilterRegistrationBean<IntakeGuard> supportIntakeGuard(RateLimiter limiter,
    @Qualifier("handlerExceptionResolver") HandlerExceptionResolver failures) {
    FilterRegistrationBean<IntakeGuard> registration = new FilterRegistrationBean<>(new IntakeGuard(limiter, failures));
    registration.setOrder(IntakeGuard.ORDER);
    registration.addUrlPatterns(IntakeGuard.PATH);
    return registration;
  }
}
