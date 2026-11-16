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
  private static final String SECRET = "s".repeat(40);

  private static MockEnvironment complete() {
    return new MockEnvironment().withProperty("platform.telegram.bot-token", TOKEN)
      .withProperty("platform.telegram.bot-name", "core_test_bot").withProperty("platform.telegram.webhook-secret", SECRET);
  }

  @Test
  @DisplayName("Полные настройки: срок по умолчанию 10 минут, адрес Bot API по умолчанию, токен не печатается")
  void defaults() {
    TelegramSettings settings = TelegramSettings.of(complete());
    assertThat(settings.linkTtl()).isEqualTo(Duration.ofMinutes(10));
    assertThat(settings.method("getMe").toString()).isEqualTo("https://api.telegram.org/bot" + TOKEN + "/getMe");
    assertThat(settings.toString()).doesNotContain(TOKEN).doesNotContain(SECRET);
  }

  @Test
  @DisplayName("Без настройки и с неверной формой служба не стартует; отказ называет настройку, но не значение")
  void refusesBadSettings() {
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.bot-token", "")))
      .hasMessageContaining("platform.telegram.bot-token");
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.bot-token", "утёкший-токен")))
      .hasMessageContaining("platform.telegram.bot-token").hasMessageNotContaining("утёкший-токен");
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.webhook-secret", "short-secret")))
      .hasMessageContaining("platform.telegram.webhook-secret").hasMessageNotContaining("short-secret");
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.bot-name", "@bot")))
      .hasMessageContaining("platform.telegram.bot-name");
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.link-ttl", "P2D")))
      .hasMessageContaining("platform.telegram.link-ttl");
    assertThatThrownBy(() -> TelegramSettings.of(complete().withProperty("platform.telegram.link-ttl", "PT0S")))
      .hasMessageContaining("platform.telegram.link-ttl");
  }
}
