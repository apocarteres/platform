package io.github.apocarteres.platform.notifications.internal;

import io.github.apocarteres.platform.auth.ModuleApiAccess;
import io.github.apocarteres.platform.notifications.NotificationChannel;
import io.github.apocarteres.platform.notifications.NotificationChannels;
import io.github.apocarteres.platform.notifications.Notifications;
import io.github.apocarteres.platform.persistence.SqlStatements;
import java.time.Clock;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

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

  // REQ-NOTIFICATIONS-012
  @Bean
  DeliveryStore notificationDeliveryStore(DataSource source, SqlStatements statements) {
    return new DeliveryStore(JdbcClient.create(source), statements.catalog(CATALOG));
  }

  // REQ-NOTIFICATIONS-011, REQ-NOTIFICATIONS-013
  @Bean
  DeliveryService notificationDelivery(DeliveryStore deliveries, ObjectProvider<NotificationChannel> channels,
    ObjectProvider<NotificationChannels> sources, PlatformTransactionManager transactions, NotificationSettings settings, Clock clock) {
    TransactionTemplate apart = new TransactionTemplate(transactions);
    apart.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    return new DeliveryService(deliveries, java.util.stream.Stream.concat(channels.orderedStream(),
      sources.orderedStream().flatMap(source -> source.channels().stream())).toList(), apart, settings, clock);
  }

  @Bean
  Notifications notifications(NotificationStore store, DeliveryStore deliveries, DeliveryService delivery,
    PlatformTransactionManager transactions, NotificationSettings settings, Clock clock) {
    return new NotificationService(store, deliveries, delivery.channels(), new TransactionTemplate(transactions), settings, clock);
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
