package io.github.apocarteres.platform.notifications.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.ApiAccess;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.EntryAccess;
import io.github.apocarteres.platform.auth.HumanCheck;
import io.github.apocarteres.platform.auth.RegistrationHook;
import io.github.apocarteres.platform.auth.Removal;
import io.github.apocarteres.platform.notifications.Notifications;
import io.github.apocarteres.platform.time.MutableClock;
import jakarta.servlet.Filter;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-NOTIFICATIONS-001, REQ-NOTIFICATIONS-002, REQ-NOTIFICATIONS-003, REQ-NOTIFICATIONS-004, REQ-NOTIFICATIONS-006
@SpringBootTest(
  classes = NotificationFlowTest.Service.class,
  properties = {
    "platform.auth.roles=USER,ADMIN",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
  }
)
class NotificationFlowTest {

  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

  static {
    POSTGRES.start();
    REDIS.start();
    try (var connection = java.sql.DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
      var statement = connection.createStatement()) {
      for (String table : List.of("platform-auth/create-account", "platform-auth/create-role", "platform-auth/create-token",
        "platform-notifications/create-notification")) {
        try (var input = NotificationFlowTest.class.getResourceAsStream("/sql/" + table + ".sql")) {
          statement.execute(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
      }
    } catch (java.sql.SQLException | java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
  }

  static final String PASSWORD = "correct horse battery";

  @DynamicPropertySource
  static void stores(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
    registry.add("spring.data.redis.host", REDIS::getHost);
    registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
  }

  @Autowired
  private WebApplicationContext context;
  @Autowired
  private Notifications notifications;
  @Autowired
  private Accounts accounts;
  @Autowired
  private MutableClock clock;
  @Autowired
  private StringRedisTemplate redis;
  @Autowired
  private DataSource source;
  @Autowired
  private PlatformTransactionManager transactions;

  private final JsonMapper json = JsonMapper.builder().build();
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    JdbcClient.create(source).sql("DELETE FROM platform_account").update();
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    clock.set(java.time.Instant.parse("2026-09-25T10:00:00Z"));
    mvc = MockMvcBuilders.webAppContextSetup(context)
      .addFilters(context.getBean("springSessionRepositoryFilter", Filter.class), context.getBean("springSecurityFilterChain", Filter.class))
      .build();
  }

  final class Tab {

    private final List<Cookie> cookies = new ArrayList<>();
    private String csrf;

    Tab(String email) throws Exception {
      csrf();
      post("/api/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}").andExpect(status().isOk());
      csrf();
    }

    private void csrf() throws Exception {
      MockHttpServletResponse response = send(MockMvcRequestBuilders.get("/api/auth/csrf")).andReturn().getResponse();
      csrf = response.getContentAsString().replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    ResultActions post(String path, String body) throws Exception {
      return send(MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON).content(body).header("X-XSRF-TOKEN", csrf));
    }

    ResultActions get(String path) throws Exception {
      return send(MockMvcRequestBuilders.get(path));
    }

    ResultActions send(AbstractMockHttpServletRequestBuilder<?> request) throws Exception {
      if (!cookies.isEmpty()) {
        request.cookie(cookies.toArray(Cookie[]::new));
      }
      ResultActions result = mvc.perform(request);
      for (Cookie cookie : result.andReturn().getResponse().getCookies()) {
        cookies.removeIf(kept -> kept.getName().equals(cookie.getName()));
        if (cookie.getMaxAge() != 0) {
          cookies.add(cookie);
        }
      }
      return result;
    }
  }

  private UUID account(String email) {
    return accounts.create(email, PASSWORD, Set.of("USER"), true, null).id();
  }

  private JsonNode bell(Tab tab) throws Exception {
    return json.readTree(tab.get("/api/notifications").andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
  }

  @Test
  @DisplayName("Колокольчик: число непрочитанного и последние свежими сверху — вид, параметры и ссылка, без текста")
  void bellShowsTheLatest() throws Exception {
    UUID player = account("player@site.example");
    for (int index = 1; index <= 25; index++) {
      clock.advance(Duration.ofMinutes(1));
      notifications.notify(player, "order.shipped", Map.of("number", Integer.toString(index)), "/orders/" + index);
    }
    Tab tab = new Tab("player@site.example");
    tab.get("/api/notifications/unread").andExpect(jsonPath("$.count").value(25));
    JsonNode bell = bell(tab);
    assertThat(bell.get("unread").asLong()).isEqualTo(25);
    assertThat(bell.get("items")).hasSize(20);
    JsonNode first = bell.get("items").get(0);
    assertThat(first.get("kind").asString()).isEqualTo("order.shipped");
    assertThat(first.get("params").get("number").asString()).isEqualTo("25");
    assertThat(first.get("link").asString()).isEqualTo("/orders/25");
    assertThat(first.get("read").asBoolean()).isFalse();
    assertThat(first.has("text")).isFalse();
    tab.get("/api/notifications?limit=5").andExpect(jsonPath("$.items.length()").value(5));
    for (int index = 26; index <= 60; index++) {
      notifications.notify(player, "order.shipped", Map.of("number", Integer.toString(index)), null);
    }
    tab.get("/api/notifications?limit=500").andExpect(jsonPath("$.items.length()").value(50));
  }

  @Test
  @DisplayName("Прочтение: своё — одно и все сразу; чужое — как несуществующее; колокольчик — только вошедшему")
  void readingIsOwn() throws Exception {
    UUID player = account("player@site.example");
    UUID other = account("other@site.example");
    UUID mine = notifications.notify(player, "a", Map.of(), "/a");
    notifications.notify(player, "b", Map.of(), null);
    UUID theirs = notifications.notify(other, "c", Map.of(), "/c");
    Tab tab = new Tab("player@site.example");
    tab.post("/api/notifications/" + theirs + "/read", "{}").andExpect(status().isNotFound())
      .andExpect(jsonPath("$.code").value("notification-not-found"));
    tab.post("/api/notifications/" + mine + "/read", "{}").andExpect(status().isNoContent());
    tab.post("/api/notifications/" + mine + "/read", "{}").andExpect(status().isNoContent());
    tab.get("/api/notifications/unread").andExpect(jsonPath("$.count").value(1));
    tab.post("/api/notifications/read-all", "{}").andExpect(status().isNoContent());
    tab.get("/api/notifications/unread").andExpect(jsonPath("$.count").value(0));
    assertThat(bell(tab).get("items")).hasSize(2);
    assertThat(bell(new Tab("other@site.example")).get("unread").asLong()).isEqualTo(1);
    mvc.perform(MockMvcRequestBuilders.get("/api/notifications")).andExpect(status().isUnauthorized());
  }

  @Test
  @DisplayName("Создание проверяет вид, параметры и ссылку: ссылка — путь сайта, а не чужой адрес")
  void notifyValidates() {
    UUID player = account("player@site.example");
    assertThatThrownBy(() -> notifications.notify(player, "Order Shipped", Map.of(), null)).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> notifications.notify(player, "a", Map.of("bad key", "x"), null)).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> notifications.notify(player, "a", Map.of("k", "x".repeat(201)), null)).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> notifications.notify(player, "a", Map.of("k", "строка\nвторая"), null)).isInstanceOf(IllegalArgumentException.class);
    Map<String, String> many = new LinkedHashMap<>();
    for (int index = 0; index < 21; index++) {
      many.put("k" + index, "v");
    }
    assertThatThrownBy(() -> notifications.notify(player, "a", many, null)).isInstanceOf(IllegalArgumentException.class);
    for (String link : List.of("https://evil.example/", "//evil.example/", "orders/1", "/x\r\ny")) {
      assertThatThrownBy(() -> notifications.notify(player, "a", Map.of(), link)).as(link).isInstanceOf(IllegalArgumentException.class);
    }
    assertThatThrownBy(() -> notifications.notify(null, "a", Map.of(), null)).isInstanceOf(IllegalArgumentException.class);
    assertThat(notifications.notify(player, "support.answered", Map.of("number", "7"), "/support/requests/1?tab=steps")).isNotNull();
  }

  @Test
  @DisplayName("Уведомление создаётся в транзакции вызывающего: откатилась работа — уведомления нет")
  void notifyJoinsTheTransaction() {
    UUID player = account("player@site.example");
    assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
      notifications.notify(player, "order.paid", Map.of(), null);
      throw new IllegalStateException("оплата откатилась");
    })).isInstanceOf(IllegalStateException.class);
    assertThat(JdbcClient.create(source).sql("SELECT COUNT(*) FROM platform_notification").query(Long.class).single()).isZero();
  }

  @Test
  @DisplayName("Сроки: по истечении срока стираются; удаление по запросу субъекта и удаление учётной записи стирают её уведомления")
  void retentionAndErasure() {
    UUID player = account("player@site.example");
    UUID other = account("other@site.example");
    notifications.notify(player, "old", Map.of(), null);
    clock.advance(Duration.ofDays(60));
    notifications.notify(player, "recent", Map.of(), null);
    notifications.notify(other, "theirs", Map.of(), null);
    clock.advance(Duration.ofDays(31));
    assertThat(notifications.purgeExpired()).isEqualTo(1);
    assertThat(notifications.purgeExpired()).isZero();
    assertThat(notifications.erase(player)).isEqualTo(1);
    assertThat(accounts.delete(other)).isEqualTo(Removal.REMOVED);
    assertThat(JdbcClient.create(source).sql("SELECT COUNT(*) FROM platform_notification").query(Long.class).single()).isZero();
  }

  @Test
  @DisplayName("Срок хранения не бывает бессрочным, список колокольчика ограничен")
  void settingsAreFinite() {
    assertThatThrownBy(() -> NotificationSettings.of(new MockEnvironment().withProperty("platform.notifications.keep", "0s")))
      .hasMessageContaining("platform.notifications.keep");
    assertThatThrownBy(() -> NotificationSettings.of(new MockEnvironment().withProperty("platform.notifications.list-size", "51")))
      .hasMessageContaining("platform.notifications.list-size");
    assertThat(NotificationSettings.of(new MockEnvironment().withProperty("platform.notifications.keep", "30d")).keep())
      .isEqualTo(Duration.ofDays(30));
  }

  static final class NoLetters implements AuthLetters {

    @Override
    public void verification(String email, URI link, Locale locale) {
    }

    @Override
    public void passwordReset(String email, URI link, Locale locale) {
    }

    @Override
    public void emailChange(String email, URI link, Locale locale) {
    }

    @Override
    public void emailChanged(String previousEmail, Locale locale) {
    }
  }

  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration
  static class Service {

    @Bean
    AuthLetters authLetters() {
      return new NoLetters();
    }

    @Bean
    RegistrationHook<?> registrationHook() {
      return RegistrationHook.NONE;
    }

    @Bean
    EntryAccess entryAccess() {
      return EntryAccess.OPEN;
    }

    @Bean
    HumanCheck humanCheck() {
      return HumanCheck.NOT_REQUIRED;
    }

    // REQ-AUTH-022
    @Bean
    ApiAccess apiAccess() {
      return rules -> rules.requestMatchers("/api/**").hasRole("ADMIN");
    }

    @Bean
    @Primary
    MutableClock clock() {
      return MutableClock.at("2026-09-25T10:00:00Z");
    }
  }
}
