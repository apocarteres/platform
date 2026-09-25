package io.github.apocarteres.platform.notifications.internal;

import io.github.apocarteres.platform.auth.ModuleApiAccess;
import io.github.apocarteres.platform.notifications.Notifications;
import io.github.apocarteres.platform.persistence.SqlStatements;
import java.time.Clock;
import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-NOTIFICATIONS-001, REQ-AUTH-022
@AutoConfiguration(afterName = {
  "io.github.apocarteres.platform.auth.internal.AuthAutoConfiguration",
  "io.github.apocarteres.platform.persistence.internal.PersistenceAutoConfiguration",
  "io.github.apocarteres.platform.time.internal.TimeAutoConfiguration",
})
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class NotificationsAutoConfiguration {

  static final String CATALOG = "platform-notifications";

  @Bean
  NotificationSettings notificationSettings(Environment environment) {
    return NotificationSettings.of(environment);
  }

  @Bean
  NotificationStore notificationStore(DataSource source, SqlStatements statements) {
    return new NotificationStore(JdbcClient.create(source), statements.catalog(CATALOG));
  }

  @Bean
  Notifications notifications(NotificationStore store, NotificationSettings settings, Clock clock) {
    return new NotificationService(store, settings, clock);
  }

  @Bean
  NotificationController notificationController(NotificationStore store, NotificationSettings settings, Clock clock) {
    return new NotificationController(store, settings, clock);
  }

  // REQ-NOTIFICATIONS-004, REQ-AUTH-022
  @Bean
  ModuleApiAccess notificationAccess() {
    return rules -> rules.requestMatchers("/api/notifications", "/api/notifications/**").authenticated();
  }
}
