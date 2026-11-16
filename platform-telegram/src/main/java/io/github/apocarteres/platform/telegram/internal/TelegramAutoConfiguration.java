package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.auth.ModuleApiAccess;
import io.github.apocarteres.platform.persistence.SqlStatements;
import io.github.apocarteres.platform.telegram.TelegramBot;
import io.github.apocarteres.platform.telegram.TelegramReplies;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-TELEGRAM-001, REQ-TELEGRAM-002, REQ-TELEGRAM-003, REQ-AUTH-022
@AutoConfiguration(afterName = {
  "io.github.apocarteres.platform.auth.internal.AuthAutoConfiguration",
  "io.github.apocarteres.platform.persistence.internal.PersistenceAutoConfiguration",
  "io.github.apocarteres.platform.time.internal.TimeAutoConfiguration",
})
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class TelegramAutoConfiguration {

  static final String CATALOG = "platform-telegram";

  @Bean
  TelegramSettings telegramSettings(Environment environment) {
    return TelegramSettings.of(environment);
  }

  @Bean
  LinkStore telegramLinkStore(DataSource source, SqlStatements statements) {
    return new LinkStore(JdbcClient.create(source), statements.catalog(CATALOG));
  }

  @Bean
  LinkService telegramLinks(LinkStore store, PlatformTransactionManager transactions, TelegramSettings settings, Clock clock) {
    return new LinkService(store, new TransactionTemplate(transactions), settings, clock);
  }

  // REQ-TELEGRAM-011
  @Bean
  TelegramBot telegramBot(TelegramSettings settings) {
    return new BotClient(settings, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
  }

  // REQ-TELEGRAM-003
  @Bean
  WebhookAuthenticator telegramWebhookAuthenticator(TelegramSettings settings) {
    return new WebhookAuthenticator(settings);
  }

  @Bean
  LinkController telegramLinkController(LinkService links) {
    return new LinkController(links);
  }

  // REQ-TELEGRAM-008
  @Bean
  WebhookController telegramWebhookController(LinkService links, ObjectProvider<TelegramReplies> replies) {
    return new WebhookController(links, replies.getIfAvailable(() -> TelegramReplies.SILENT));
  }

  // REQ-TELEGRAM-003, REQ-TELEGRAM-009, REQ-AUTH-022
  @Bean
  ModuleApiAccess telegramAccess() {
    return rules -> {
      rules.requestMatchers(HttpMethod.POST, WebhookAuthenticator.PATH).authenticated();
      rules.requestMatchers(WebhookAuthenticator.PATH).denyAll();
      rules.requestMatchers("/api/telegram/**").authenticated();
    };
  }
}
