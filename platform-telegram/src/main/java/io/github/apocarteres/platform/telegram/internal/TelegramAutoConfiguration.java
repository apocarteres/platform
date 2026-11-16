package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.auth.ModuleApiAccess;
import io.github.apocarteres.platform.persistence.SqlStatements;
import io.github.apocarteres.platform.auth.SignIn;
import io.github.apocarteres.platform.ratelimit.RateLimiter;
import io.github.apocarteres.platform.telegram.TelegramCodeText;
import io.github.apocarteres.platform.telegram.TelegramReplies;
import io.github.apocarteres.platform.telegram.TelegramTexts;
import java.time.Clock;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-TELEGRAM-001, REQ-TELEGRAM-002, REQ-TELEGRAM-003, REQ-TELEGRAM-020, REQ-TELEGRAM-021, REQ-AUTH-022
@AutoConfiguration(afterName = {
  "io.github.apocarteres.platform.auth.internal.AuthAutoConfiguration",
  "io.github.apocarteres.platform.persistence.internal.PersistenceAutoConfiguration",
  "io.github.apocarteres.platform.time.internal.TimeAutoConfiguration",
  "io.github.apocarteres.platform.notifications.internal.NotificationsAutoConfiguration",
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
  Bots telegramBots(TelegramSettings settings) {
    return new Bots(settings);
  }

  // REQ-TELEGRAM-003
  @Bean
  WebhookAuthenticator telegramWebhookAuthenticator(TelegramSettings settings) {
    return new WebhookAuthenticator(settings);
  }

  // REQ-TELEGRAM-018
  @Bean
  MiniAppAuthenticator telegramMiniAppAuthenticator(TelegramSettings settings, Clock clock) {
    return new MiniAppAuthenticator(settings, clock);
  }

  @Bean
  LinkController telegramLinkController(LinkService links) {
    return new LinkController(links);
  }

  // REQ-TELEGRAM-020
  @Bean
  LoginController telegramLoginController(LinkService links, SignIn sessions, RateLimiter limiter, TelegramSettings settings,
    Clock clock) {
    return new LoginController(links, sessions, limiter, settings, clock);
  }

  // REQ-TELEGRAM-021
  @Configuration(proxyBeanMethods = false)
  @ConditionalOnProperty(name = "platform.telegram.second-factor.bot")
  static class SecondFactorConfiguration {

    @Bean
    CodeStore telegramCodeStore(DataSource source, SqlStatements statements) {
      return new CodeStore(JdbcClient.create(source), statements.catalog(CATALOG));
    }

    @Bean
    TelegramSecondFactor telegramSecondFactor(TelegramSettings settings, LinkStore links, CodeStore codes, Bots bots,
      ObjectProvider<TelegramCodeText> text, Clock clock) {
      TelegramCodeText declared = text.getIfAvailable();
      if (declared == null) {
        throw new IllegalStateException("Настройка platform.telegram.second-factor.bot: код второго шага пишет проект —"
          + " объявите бин TelegramCodeText");
      }
      String bot = settings.secondFactorBot();
      return new TelegramSecondFactor(bot, links, codes, bots.client(bot), declared, clock);
    }
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
      rules.requestMatchers(HttpMethod.POST, "/api/telegram/*/webhook").authenticated();
      // REQ-TELEGRAM-020
      rules.requestMatchers(HttpMethod.POST, "/api/telegram/*/login").permitAll();
      rules.requestMatchers("/api/telegram/*/webhook").denyAll();
      rules.requestMatchers("/api/telegram/**").authenticated();
    };
  }

  // REQ-TELEGRAM-014
  @Configuration(proxyBeanMethods = false)
  @ConditionalOnClass(name = "io.github.apocarteres.platform.notifications.NotificationChannels")
  static class ChannelConfiguration {

    @Bean
    TelegramChannels telegramChannels(LinkStore links, ObjectProvider<TelegramTexts> texts, Bots bots, TelegramSettings settings,
      Clock clock) {
      return new TelegramChannels(links, texts.getIfAvailable(), bots, settings, clock);
    }
  }
}
