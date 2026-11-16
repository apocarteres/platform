package io.github.apocarteres.platform.telegram.internal;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.notifications.DeliveryRun;
import io.github.apocarteres.platform.notifications.NotificationDelivery;
import io.github.apocarteres.platform.notifications.Notifications;
import io.github.apocarteres.platform.telegram.TelegramLinks;
import io.github.apocarteres.platform.telegram.TelegramTexts;
import io.github.apocarteres.platform.time.MutableClock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

// REQ-TELEGRAM-014, REQ-TELEGRAM-015, REQ-TELEGRAM-016, REQ-TELEGRAM-017
@SpringBootTest(
  classes = DeliveryTest.Texts.class,
  properties = {
    "spring.liquibase.enabled=false",
    "platform.auth.roles=USER",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
    "platform.telegram.bots.news.name=site_news_bot",
    "platform.telegram.bots.support.name=site_support_bot",
  }
)
class DeliveryTest {

  private static final LinkFlowTest.BotApi BOT_API = LinkFlowTest.BOT_API;
  private static final java.util.concurrent.atomic.AtomicInteger RUNS = new java.util.concurrent.atomic.AtomicInteger();

  @DynamicPropertySource
  static void stores(DynamicPropertyRegistry registry) {
    LinkFlowTest.stores(registry);
  }

  @Autowired
  private Notifications notifications;
  @Autowired
  private NotificationDelivery delivery;
  @Autowired
  private Accounts accounts;
  @Autowired
  private TelegramLinks links;
  @Autowired
  private MutableClock clock;
  @Autowired
  private DataSource source;

  private JdbcClient jdbc;

  @BeforeEach
  void setUp() {
    jdbc = JdbcClient.create(source);
    jdbc.sql("DELETE FROM platform_account").update();
    clock.set(Instant.parse("2026-11-16T10:00:00Z").plus(java.time.Duration.ofHours(RUNS.incrementAndGet())));
    BOT_API.calls.clear();
    BOT_API.queued.clear();
    BOT_API.answer = "{\"ok\":true,\"result\":{}}";
  }

  private UUID account(String email) {
    return accounts.create(email, LinkFlowTest.PASSWORD, Set.of("USER"), true, null).id();
  }

  private void link(UUID account, long chat, String language) {
    link(account, "news", chat, language);
  }

  private void link(UUID account, String bot, long chat, String language) {
    jdbc.sql("INSERT INTO platform_telegram_link (account_id, bot, telegram_user, chat_id, linked_at, language)"
      + " VALUES (:a, :b, :c, :c, :t, :l)").param("a", account).param("b", bot).param("c", chat).param("t", OffsetDateTime.parse("2026-11-16T09:00:00Z")).param("l", language).update();
  }

  private static String refusal(int code, String description) {
    return "{\"ok\":false,\"error_code\":" + code + ",\"description\":\"" + description + "\"}";
  }

  @Test
  @DisplayName("Уведомление учётной записи со связью уходит в её чат текстом проекта со ссылкой от адреса сайта и языком связи")
  void deliversToTheLinkedChat() {
    UUID player = account("player@site.example");
    link(player, 7001L, "ru");
    notifications.notify(player, "support.answered", Map.of("number", "7"), "/support/requests/r");
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(1, 1, 0, 0));
    assertThat(BOT_API.calls).singleElement().satisfies(call -> {
      assertThat(call.path()).endsWith("/sendMessage");
      assertThat(call.body()).contains("\"chat_id\":7001")
        .contains("\"text\":\"news ru: ответ по обращению 7 https://site.example/support/requests/r\"");
    });
    assertThat(delivery.deliverPending().claimed()).isZero();
  }

  @Test
  @DisplayName("Без связи и без текста для вида в Telegram не уходит; снятая после notify связь — тоже")
  void skipsWithoutLinkOrText() {
    UUID lonely = account("lonely@site.example");
    UUID player = account("player@site.example");
    link(player, 7001L, null);
    notifications.notify(lonely, "support.answered", Map.of("number", "1"), null);
    notifications.notify(player, "support.arrived", Map.of(), null);
    notifications.notify(player, "support.answered", Map.of("number", "2"), null);
    links.unlink(player, "news");
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(0, 6, 0, 0));
    assertThat(BOT_API.calls).isEmpty();
  }

  @Test
  @DisplayName("403 — бот заблокирован: связь снимается; 400 — отказ; 429 — ждать указанный срок без счёта попытки; 5xx — повтор")
  void readsBotApiRefusals() {
    UUID blocked = account("blocked@site.example");
    UUID rejected = account("rejected@site.example");
    UUID limited = account("limited@site.example");
    UUID broken = account("broken@site.example");
    link(blocked, 7001L, "ru");
    link(rejected, 7002L, "ru");
    link(limited, 7003L, "ru");
    link(broken, 7004L, "ru");
    for (UUID one : new UUID[] {blocked, rejected, limited, broken}) {
      notifications.notify(one, "support.answered", Map.of("number", "1"), null);
    }
    BOT_API.queued.add(refusal(403, "Forbidden: bot was blocked by the user"));
    BOT_API.queued.add(refusal(400, "Bad Request: chat not found"));
    BOT_API.queued.add("{\"ok\":false,\"error_code\":429,\"description\":\"Too Many Requests\",\"parameters\":{\"retry_after\":7}}");
    BOT_API.queued.add(refusal(502, "Bad Gateway"));
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(0, 4, 2, 2));
    assertThat(links.chat(blocked, "news")).isEmpty();
    assertThat(links.chat(rejected, "news")).isPresent();
    assertThat(jdbc.sql("SELECT attempts FROM platform_notification_delivery d JOIN platform_notification n ON n.id = d.notification_id"
      + " WHERE n.account_id = :a").param("a", limited).query(Integer.class).single()).isZero();
    assertThat(jdbc.sql("SELECT attempts FROM platform_notification_delivery d JOIN platform_notification n ON n.id = d.notification_id"
      + " WHERE n.account_id = :a").param("a", broken).query(Integer.class).single()).isEqualTo(1);
    clock.advance(java.time.Duration.ofSeconds(7));
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(1, 0, 0, 0));
  }

  @Test
  @DisplayName("В один чат — не чаще раза в секунду: второе уведомление ждёт, попытка не считается")
  void pacesOneChat() {
    UUID player = account("player@site.example");
    link(player, 7001L, "ru");
    notifications.notify(player, "support.answered", Map.of("number", "1"), null);
    notifications.notify(player, "support.answered", Map.of("number", "2"), null);
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(1, 2, 0, 1));
    clock.advance(TelegramChannel.PER_CHAT);
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(1, 0, 0, 0));
    assertThat(BOT_API.calls).hasSize(2);
  }

  @Test
  @DisplayName("Каждый бот — свой канал: уведомление уходит в те боты, с которыми есть связь и для которых проект дал текст")
  void eachBotIsAChannel() {
    UUID player = account("player@site.example");
    link(player, "news", 7001L, "ru");
    link(player, "support", 7001L, "en");
    notifications.notify(player, "support.answered", Map.of("number", "7"), null);
    notifications.notify(player, "news.posted", Map.of("number", "8"), null);
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(2, 1, 0, 1));
    clock.advance(TelegramChannel.PER_CHAT);
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(1, 0, 0, 0));
    assertThat(BOT_API.calls).extracting(LinkFlowTest.Call::path).containsExactlyInAnyOrder(
      "/bot" + LinkFlowTest.BOT_TOKEN + "/sendMessage", "/bot" + LinkFlowTest.SUPPORT_TOKEN + "/sendMessage",
      "/bot" + LinkFlowTest.BOT_TOKEN + "/sendMessage");
    assertThat(BOT_API.calls).extracting(LinkFlowTest.Call::body).anySatisfy(body -> assertThat(body).contains("support en: ответ по обращению 7"))
      .anySatisfy(body -> assertThat(body).contains("news ru: новость 8"));
    assertThat(jdbc.sql("SELECT DISTINCT channel FROM platform_notification_delivery").query(String.class).list()).isEmpty();
  }

  @Configuration(proxyBeanMethods = false)
  @Import(LinkFlowTest.Service.class)
  static class Texts {

    // REQ-TELEGRAM-015
    @Bean
    TelegramTexts telegramTexts() {
      return notice -> switch (notice.kind()) {
        case "support.answered" -> Optional.of(notice.bot() + " " + notice.language() + ": ответ по обращению "
          + notice.params().get("number") + (notice.link() == null ? "" : " " + notice.link()));
        case "news.posted" -> notice.bot().equals("news")
          ? Optional.of(notice.bot() + " " + notice.language() + ": новость " + notice.params().get("number")) : Optional.empty();
        default -> Optional.empty();
      };
    }
  }
}
