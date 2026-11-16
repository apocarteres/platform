package io.github.apocarteres.platform.telegram.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

// REQ-TELEGRAM-002
class SettingsTest {

  private static final String TOKEN = "123456:" + "t".repeat(35);
  private static final String OTHER_TOKEN = "654321:" + "u".repeat(35);
  private static final String SECRET = "s".repeat(40);
  private static final String OTHER_SECRET = "v".repeat(40);

  private static MockEnvironment complete() {
    return new MockEnvironment().withProperty("platform.auth.link-base", "https://site.example")
      .withProperty("platform.telegram.bots.news.token", TOKEN)
      .withProperty("platform.telegram.bots.news.name", "site_news_bot")
      .withProperty("platform.telegram.bots.news.webhook-secret", SECRET)
      .withProperty("platform.telegram.bots.support.token", OTHER_TOKEN)
      .withProperty("platform.telegram.bots.support.name", "site_support_bot")
      .withProperty("platform.telegram.bots.support.webhook-secret", OTHER_SECRET);
  }

  @Test
  @DisplayName("Боты по идентификатору: срок по умолчанию 10 минут, адрес Bot API по умолчанию, токены не печатаются")
  void defaults() {
    TelegramSettings settings = TelegramSettings.of(complete());
    assertThat(settings.bots()).containsOnlyKeys("news", "support");
    assertThat(settings.linkTtl()).isEqualTo(Duration.ofMinutes(10));
    assertThat(settings.bot("news").method(settings.apiBase(), "getMe").toString())
      .isEqualTo("https://api.telegram.org/bot" + TOKEN + "/getMe");
    assertThat(settings.toString()).doesNotContain(TOKEN).doesNotContain(SECRET);
    assertThat(settings.bot("news").toString()).doesNotContain(TOKEN).doesNotContain(SECRET);
  }

  @Test
  @DisplayName("Без ботов, с неверной формой и с повтором между ботами служба не стартует; отказ называет настройку, но не значение")
  void refusesBadSettings() {
    assertThatThrownBy(() -> TelegramSettings.of(new MockEnvironment().withProperty("platform.auth.link-base", "https://site.example")))
      .hasMessageContaining("platform.telegram.bots");
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.bots.news.token", "")))
      .hasMessageContaining("platform.telegram.bots.news.token");
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.bots.news.token", "утёкший-токен")))
      .hasMessageContaining("platform.telegram.bots.news.token").hasMessageNotContaining("утёкший-токен");
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.bots.news.webhook-secret", "short-secret")))
      .hasMessageContaining("platform.telegram.bots.news.webhook-secret").hasMessageNotContaining("short-secret");
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.bots.support.webhook-secret", SECRET)))
      .hasMessageContaining("webhook-secret").hasMessageNotContaining(SECRET);
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.bots.support.token", TOKEN)))
      .hasMessageContaining(".token").hasMessageNotContaining(TOKEN);
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.bots.news.name", "@bot")))
      .hasMessageContaining("platform.telegram.bots.news.name");
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.link-ttl", "P2D")))
      .hasMessageContaining("platform.telegram.link-ttl");
  }

  @Test
  @DisplayName("Прежние ключи одного бота останавливают запуск с указанием миграции")
  void formerKeysPointToMigration() {
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.bot-token", TOKEN)))
      .hasMessageContaining("platform.telegram.bot-token").hasMessageContaining("18.0.0").hasMessageNotContaining(TOKEN);
  }
}
