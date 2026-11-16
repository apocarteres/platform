package io.github.apocarteres.platform.notifications.internal;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.notifications.Delivery;
import io.github.apocarteres.platform.notifications.DeliveryNotice;
import io.github.apocarteres.platform.notifications.DeliveryRun;
import io.github.apocarteres.platform.notifications.NotificationChannel;
import io.github.apocarteres.platform.notifications.NotificationDelivery;
import io.github.apocarteres.platform.notifications.Notifications;
import io.github.apocarteres.platform.time.MutableClock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Function;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-NOTIFICATIONS-011, REQ-NOTIFICATIONS-012, REQ-NOTIFICATIONS-013, REQ-NOTIFICATIONS-014
@SpringBootTest(
  classes = DeliveryFlowTest.Channels.class,
  properties = {
    "spring.liquibase.enabled=false",
    "platform.auth.roles=USER,ADMIN",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
    "platform.auth.headers.hsts.enabled=false",
    "platform.notifications.delivery.batch=5",
  }
)
class DeliveryFlowTest {

  @DynamicPropertySource
  static void stores(DynamicPropertyRegistry registry) {
    NotificationFlowTest.stores(registry);
  }

  @Autowired
  private Notifications notifications;
  @Autowired
  private NotificationDelivery delivery;
  @Autowired
  private Accounts accounts;
  @Autowired
  private MutableClock clock;
  @Autowired
  private DataSource source;
  @Autowired
  private PlatformTransactionManager transactions;
  @Autowired
  private Recording channel;

  private JdbcClient jdbc;
  private UUID account;

  @BeforeEach
  void setUp() {
    jdbc = JdbcClient.create(source);
    jdbc.sql("DELETE FROM platform_account").update();
    clock.set(java.time.Instant.parse("2026-11-16T10:00:00Z"));
    channel.sent.clear();
    channel.answer = notice -> Delivery.delivered();
    account = accounts.create("player@site.example", NotificationFlowTest.PASSWORD, Set.of("USER"), true, null).id();
  }

  private long queued() {
    return jdbc.sql("SELECT COUNT(*) FROM platform_notification_delivery").query(Long.class).single();
  }

  @Test
  @DisplayName("Уведомление уходит в канал один раз: повторная команда его не шлёт")
  void deliversOnce() {
    UUID id = notifications.notify(account, "support.answered", Map.of("number", "7"), "/support/requests/r");
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(1, 0, 0, 0));
    assertThat(channel.sent).singleElement().satisfies(notice -> {
      assertThat(notice.id()).isEqualTo(id);
      assertThat(notice.account()).isEqualTo(account);
      assertThat(notice.params()).isEqualTo(Map.of("number", "7"));
      assertThat(notice.link()).isEqualTo("/support/requests/r");
    });
    assertThat(delivery.deliverPending().claimed()).isZero();
    assertThat(queued()).isZero();
  }

  @Test
  @DisplayName("Откат транзакции notify — нет и доставки")
  void rollbackLeavesNothing() {
    new TransactionTemplate(transactions).executeWithoutResult(status -> {
      notifications.notify(account, "support.answered", Map.of(), null);
      status.setRollbackOnly();
    });
    assertThat(queued()).isZero();
    assertThat(delivery.deliverPending().claimed()).isZero();
    assertThat(channel.sent).isEmpty();
  }

  @Test
  @DisplayName("Два одновременных запуска не шлют одно уведомление дважды")
  void concurrentRunsDoNotRepeat() throws Exception {
    List<UUID> created = new ArrayList<>();
    for (int index = 0; index < 23; index++) {
      created.add(notifications.notify(account, "support.answered", Map.of("number", String.valueOf(index)), null));
    }
    channel.answer = notice -> {
      try {
        Thread.sleep(5);
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
      }
      return Delivery.delivered();
    };
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      List<Future<?>> runs = new ArrayList<>();
      for (int worker = 0; worker < 2; worker++) {
        runs.add(pool.submit(() -> {
          while (delivery.deliverPending().claimed() > 0) {
            Thread.onSpinWait();
          }
        }));
      }
      for (Future<?> run : runs) {
        run.get();
      }
    } finally {
      pool.shutdownNow();
    }
    assertThat(channel.sent).extracting(DeliveryNotice::id).containsExactlyInAnyOrderElementsOf(created);
    assertThat(queued()).isZero();
  }

  @Test
  @DisplayName("Прочитанное, убранное правкой и стёртое до отправки не уходит; правленое уходит правленым")
  void deliversTheCurrentState() {
    UUID read = notifications.notify(account, "support.answered", Map.of("number", "1"), "/a");
    notifications.notify(account, "support.answered", Map.of("number", "2"), "/b");
    notifications.notify(account, "support.answered", Map.of("number", "3"), "/c");
    jdbc.sql("UPDATE platform_notification SET read_at = created_at WHERE id = :id").param("id", read).update();
    notifications.revise("support.answered", "/b", params -> null);
    notifications.revise("support.answered", "/c", params -> Map.of("number", "33"));
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(1, 1, 0, 0));
    assertThat(channel.sent).singleElement().satisfies(notice -> assertThat(notice.params()).isEqualTo(Map.of("number", "33")));
    notifications.notify(account, "support.answered", Map.of(), null);
    notifications.erase(account);
    assertThat(delivery.deliverPending().claimed()).isZero();
  }

  @Test
  @DisplayName("Повтор — через срок с ростом и не больше восьми попыток; «позже» и отказ канала попыток не теряют")
  void retriesWithBackoff() {
    notifications.notify(account, "support.answered", Map.of(), null);
    channel.answer = notice -> Delivery.later(Duration.ofSeconds(30));
    assertThat(delivery.deliverPending()).isEqualTo(new DeliveryRun(0, 0, 0, 1));
    assertThat(delivery.deliverPending().claimed()).isZero();
    clock.advance(Duration.ofSeconds(30));
    channel.answer = notice -> {
      throw new IllegalStateException("канал недоступен");
    };
    assertThat(delivery.deliverPending().postponed()).isEqualTo(1);
    assertThat(jdbc.sql("SELECT attempts FROM platform_notification_delivery").query(Integer.class).single()).isEqualTo(1);
    clock.advance(Duration.ofSeconds(59));
    assertThat(delivery.deliverPending().claimed()).isZero();
    channel.answer = notice -> Delivery.retry();
    for (int attempt = 2; attempt <= DeliveryService.ATTEMPTS; attempt++) {
      clock.advance(DeliveryService.backoff(attempt - 1));
      assertThat(delivery.deliverPending().postponed()).as("попытка " + attempt).isEqualTo(1);
    }
    assertThat(queued()).isZero();
    assertThat(channel.sent).hasSize(DeliveryService.ATTEMPTS + 1);
    assertThat(channel.sent.get(1).attempts()).isZero();
    assertThat(channel.sent.get(2).attempts()).isEqualTo(1);
  }

  @Test
  @DisplayName("Пачка — не больше объявленного размера")
  void respectsTheBatch() {
    for (int index = 0; index < 7; index++) {
      notifications.notify(account, "support.answered", Map.of(), null);
    }
    assertThat(delivery.deliverPending().delivered()).isEqualTo(5);
    assertThat(delivery.deliverPending().delivered()).isEqualTo(2);
  }

  static final class Recording implements NotificationChannel {

    final List<DeliveryNotice> sent = new CopyOnWriteArrayList<>();
    volatile Function<DeliveryNotice, Delivery> answer = notice -> Delivery.delivered();

    @Override
    public String name() {
      return "test";
    }

    @Override
    public Delivery deliver(DeliveryNotice notice) {
      sent.add(notice);
      return answer.apply(notice);
    }
  }

  @Configuration(proxyBeanMethods = false)
  @Import(NotificationFlowTest.Service.class)
  static class Channels {

    @Bean
    Recording recording() {
      return new Recording();
    }
  }
}
