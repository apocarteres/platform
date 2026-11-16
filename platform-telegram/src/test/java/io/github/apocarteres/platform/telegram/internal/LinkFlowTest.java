package io.github.apocarteres.platform.telegram.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.ApiAccess;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.EntryAccess;
import io.github.apocarteres.platform.auth.HumanCheck;
import io.github.apocarteres.platform.auth.RegistrationHook;
import io.github.apocarteres.platform.auth.Removal;
import io.github.apocarteres.platform.telegram.TelegramBot;
import io.github.apocarteres.platform.telegram.TelegramLinks;
import io.github.apocarteres.platform.telegram.TelegramReplies;
import io.github.apocarteres.platform.telegram.TelegramUnavailable;
import io.github.apocarteres.platform.time.MutableClock;
import jakarta.servlet.Filter;
import jakarta.servlet.http.Cookie;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-TELEGRAM-003, REQ-TELEGRAM-004, REQ-TELEGRAM-005, REQ-TELEGRAM-006, REQ-TELEGRAM-007, REQ-TELEGRAM-008,
// REQ-TELEGRAM-009, REQ-TELEGRAM-010, REQ-TELEGRAM-011
@SpringBootTest(
  classes = LinkFlowTest.Service.class,
  properties = {
    "spring.liquibase.enabled=false",
    "platform.auth.roles=USER",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
    "platform.telegram.bot-name=core_test_bot",
    "platform.telegram.link-ttl=PT10M",
  }
)
class LinkFlowTest {

  static final String BOT_TOKEN = "123456:" + "t".repeat(35);
  static final String SECRET = "s".repeat(40);
  static final String PASSWORD = "correct horse battery";

  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
  static final BotApi BOT_API = new BotApi();

  static {
    POSTGRES.start();
    REDIS.start();
    try (var connection = java.sql.DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
      liquibase.database.Database database = liquibase.database.DatabaseFactory.getInstance()
        .findCorrectDatabaseImplementation(new liquibase.database.jvm.JdbcConnection(connection));
      for (String file : List.of("platform/changelog/platform-auth.yaml", "platform/changelog/platform-telegram.yaml")) {
        new liquibase.Liquibase(file, new liquibase.resource.ClassLoaderResourceAccessor(), database)
          .update(new liquibase.Contexts(), new liquibase.LabelExpression());
      }
    } catch (java.sql.SQLException | liquibase.exception.LiquibaseException failure) {
      throw new IllegalStateException(failure);
    }
  }

  @DynamicPropertySource
  static void stores(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
    registry.add("spring.data.redis.host", REDIS::getHost);
    registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    registry.add("platform.telegram.bot-token", () -> BOT_TOKEN);
    registry.add("platform.telegram.webhook-secret", () -> SECRET);
    registry.add("platform.telegram.api-base", BOT_API::base);
  }

  @Autowired
  private WebApplicationContext context;
  @Autowired
  private MutableClock clock;
  @Autowired
  private Accounts accounts;
  @Autowired
  private StringRedisTemplate redis;
  @Autowired
  private DataSource source;
  @Autowired
  private TelegramLinks links;
  @Autowired
  private TelegramBot bot;

  private final JsonMapper json = JsonMapper.builder().build();
  private MockMvc mvc;
  private JdbcClient jdbc;

  @BeforeEach
  void setUp() {
    jdbc = JdbcClient.create(source);
    jdbc.sql("DELETE FROM platform_account").update();
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    clock.set(java.time.Instant.parse("2026-11-16T10:00:00Z"));
    BOT_API.calls.clear();
    BOT_API.answer = "{\"ok\":true,\"result\":true}";
    mvc = MockMvcBuilders.webAppContextSetup(context)
      .addFilters(context.getBean("springSessionRepositoryFilter", Filter.class), context.getBean("springSecurityFilterChain", Filter.class))
      .build();
  }

  final class Tab {

    private final List<Cookie> cookies = new ArrayList<>();
    private String csrf;

    Tab() throws Exception {
      csrf = token(send(MockMvcRequestBuilders.get("/api/auth/csrf")).andExpect(status().isOk()).andReturn().getResponse());
    }

    Tab signIn(String email) throws Exception {
      post("/api/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}").andExpect(status().isOk());
      csrf = token(get("/api/auth/csrf").andReturn().getResponse());
      return this;
    }

    private static String token(MockHttpServletResponse response) throws Exception {
      return response.getContentAsString().replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    ResultActions post(String path, String body) throws Exception {
      return send(MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON).content(body).header("X-XSRF-TOKEN", csrf));
    }

    ResultActions get(String path) throws Exception {
      return send(MockMvcRequestBuilders.get(path));
    }

    ResultActions delete(String path) throws Exception {
      return send(MockMvcRequestBuilders.delete(path).header("X-XSRF-TOKEN", csrf));
    }

    String invite() throws Exception {
      String url = body(post("/api/telegram/link", "{}").andExpect(status().isOk())).get("url").asString();
      assertThat(url).matches("https://t\\.me/core_test_bot\\?start=[A-Za-z0-9_-]{43}");
      return url.substring(url.indexOf("start=") + "start=".length());
    }

    ResultActions send(AbstractMockHttpServletRequestBuilder<?> request) throws Exception {
      if (!cookies.isEmpty()) {
        request.cookie(cookies.toArray(Cookie[]::new));
      }
      ResultActions result = mvc.perform(request.locale(Locale.forLanguageTag("ru-RU")));
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

  private JsonNode body(ResultActions result) throws Exception {
    return json.readTree(result.andReturn().getResponse().getContentAsString());
  }

  private static String update(String chatType, long user, String text) {
    return "{\"update_id\":1,\"message\":{\"message_id\":5,\"date\":1,\"text\":\"" + text + "\",\"chat\":{\"id\":" + user
      + ",\"type\":\"" + chatType + "\"},\"from\":{\"id\":" + user + ",\"is_bot\":false,\"first_name\":\"Имя\",\"language_code\":\"ru\"}}}";
  }

  private ResultActions webhook(String secret, String update) throws Exception {
    var request = MockMvcRequestBuilders.post("/api/telegram/webhook").contentType(MediaType.APPLICATION_JSON).content(update);
    if (secret != null) {
      request.header(WebhookAuthenticator.HEADER, secret);
    }
    return mvc.perform(request);
  }

  private ResultActions start(long user, String token) throws Exception {
    return webhook(SECRET, update("private", user, "/start " + token));
  }

  private long links() {
    return jdbc.sql("SELECT COUNT(*) FROM platform_telegram_link").query(Long.class).single();
  }

  @Test
  @DisplayName("Ссылка связи, /start из личного чата — связь записана, ответ в чат текстом проекта, владелец видит связь")
  void linksByInvitation() throws Exception {
    UUID id = account("player@site.example");
    Tab player = new Tab().signIn("player@site.example");
    player.get("/api/telegram/link").andExpect(status().isOk()).andExpect(jsonPath("$.linked").value(false));
    JsonNode invitation = body(player.post("/api/telegram/link", "{}").andExpect(status().isOk()));
    assertThat(invitation.get("expiresAt").asString()).isEqualTo("2026-11-16T10:10:00Z");
    String token = invitation.get("url").asString().replaceAll(".*start=", "");
    assertThat(jdbc.sql("SELECT digest FROM platform_telegram_invite").query(String.class).single()).doesNotContain(token);

    start(7001L, token).andExpect(status().isOk())
      .andExpect(jsonPath("$.method").value("sendMessage")).andExpect(jsonPath("$.chat_id").value(7001L))
      .andExpect(jsonPath("$.text").value("связано ru"));
    assertThat(links.chat(id)).isEqualTo(OptionalLong.of(7001L));
    player.get("/api/telegram/link").andExpect(jsonPath("$.linked").value(true))
      .andExpect(jsonPath("$.linkedAt").value("2026-11-16T10:00:00Z"));
    assertThat(player.get("/api/telegram/link").andReturn().getResponse().getContentAsString()).doesNotContain("7001");
    player.post("/api/telegram/link", "{}").andExpect(status().isConflict())
      .andExpect(jsonPath("$.code").value("telegram-already-linked"));
  }

  @Test
  @DisplayName("Повторный, истёкший, неизвестный и погашенный новой выдачей токен связи не дают")
  void refusesSpentTokens() throws Exception {
    UUID id = account("player@site.example");
    Tab player = new Tab().signIn("player@site.example");
    String replaced = player.invite();
    String expired = player.invite();
    start(7001L, replaced).andExpect(status().isOk()).andExpect(jsonPath("$.text").value("отказ ru"));
    clock.advance(Duration.ofMinutes(10));
    start(7001L, expired).andExpect(status().isOk()).andExpect(jsonPath("$.text").value("отказ ru"));
    start(7001L, "A".repeat(43)).andExpect(status().isOk()).andExpect(jsonPath("$.text").value("отказ ru"));
    start(7001L, "короткий").andExpect(status().isOk()).andExpect(jsonPath("$.text").value("отказ ru"));
    String fresh = player.invite();
    start(7001L, fresh).andExpect(jsonPath("$.text").value("связано ru"));
    player.delete("/api/telegram/link").andExpect(status().isNoContent());
    start(7001L, fresh).andExpect(jsonPath("$.text").value("отказ ru"));
    assertThat(links.chat(id)).isEmpty();
  }

  @Test
  @DisplayName("Человек Telegram связан с одной учётной записью: вторая его же связью не получает")
  void onePersonOneAccount() throws Exception {
    account("first@site.example");
    UUID second = account("second@site.example");
    start(7001L, new Tab().signIn("first@site.example").invite()).andExpect(jsonPath("$.text").value("связано ru"));
    start(7001L, new Tab().signIn("second@site.example").invite()).andExpect(jsonPath("$.text").value("отказ ru"));
    assertThat(links.chat(second)).isEmpty();
    assertThat(links()).isEqualTo(1L);
  }

  @Test
  @DisplayName("Webhook без верного секрета — identity-rejected до разбора, связь не записана")
  void webhookNeedsTheSecret() throws Exception {
    account("player@site.example");
    String token = new Tab().signIn("player@site.example").invite();
    webhook(null, update("private", 7001L, "/start " + token)).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("identity-rejected"));
    webhook("x".repeat(40), update("private", 7001L, "/start " + token)).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("identity-rejected"));
    webhook(null, "не json").andExpect(status().isUnauthorized());
    assertThat(links()).isZero();
    start(7001L, token).andExpect(jsonPath("$.text").value("связано ru"));
  }

  @Test
  @DisplayName("Прочие обновления — 200 без тела: не /start, не личный чат, без отправителя")
  void otherUpdatesAreSkipped() throws Exception {
    account("player@site.example");
    String token = new Tab().signIn("player@site.example").invite();
    webhook(SECRET, update("group", 7001L, "/start " + token)).andExpect(status().isOk()).andExpect(content().string(""));
    webhook(SECRET, update("private", 7001L, "привет")).andExpect(status().isOk()).andExpect(content().string(""));
    webhook(SECRET, update("private", 7001L, "/start")).andExpect(status().isOk()).andExpect(content().string(""));
    webhook(SECRET, "{\"update_id\":2,\"edited_message\":{}}").andExpect(status().isOk()).andExpect(content().string(""));
    assertThat(links()).isZero();
    start(7001L, token).andExpect(jsonPath("$.text").value("связано ru"));
  }

  @Test
  @DisplayName("Точки связи — только вошедшему; снятие отсутствующей связи безвредно")
  void linkEndpointsAreForTheSignedIn() throws Exception {
    Tab guest = new Tab();
    guest.get("/api/telegram/link").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("authentication-required"));
    guest.post("/api/telegram/link", "{}").andExpect(status().isUnauthorized());
    account("player@site.example");
    Tab player = new Tab().signIn("player@site.example");
    player.delete("/api/telegram/link").andExpect(status().isNoContent());
    player.send(MockMvcRequestBuilders.post("/api/telegram/link")).andExpect(status().isForbidden())
      .andExpect(jsonPath("$.code").value("csrf-rejected"));
  }

  @Test
  @DisplayName("Удаление учётной записи стирает связь и невыданную ссылку: исход REMOVED")
  void accountRemovalErasesTheLink() throws Exception {
    UUID id = account("player@site.example");
    Tab player = new Tab().signIn("player@site.example");
    start(7001L, player.invite()).andExpect(jsonPath("$.text").value("связано ru"));
    UUID pending = account("pending@site.example");
    new Tab().signIn("pending@site.example").invite();
    UUID other = account("other@site.example");
    new Tab().signIn("other@site.example").invite();
    assertThat(accounts.delete(id)).isEqualTo(Removal.REMOVED);
    assertThat(accounts.delete(pending)).isEqualTo(Removal.REMOVED);
    assertThat(links()).isZero();
    assertThat(jdbc.sql("SELECT account_id FROM platform_telegram_invite").query(UUID.class).list()).containsExactly(other);
  }

  @Test
  @DisplayName("Bot API: webhook регистрируется с секретом из настроек; отказ не несёт токена бота")
  void botApiCalls() {
    bot.useWebhook(URI.create("https://site.example/api/telegram/webhook"));
    assertThat(BOT_API.calls).singleElement().satisfies(call -> {
      assertThat(call.path()).isEqualTo("/bot" + BOT_TOKEN + "/setWebhook");
      assertThat(call.body()).contains("\"url\":\"https://site.example/api/telegram/webhook\"").contains("\"secret_token\":\"" + SECRET + "\"");
    });
    bot.send(7001L, "текст");
    assertThat(BOT_API.calls.get(1).body()).contains("\"chat_id\":7001").contains("\"text\":\"текст\"");
    BOT_API.answer = "{\"ok\":false,\"error_code\":400,\"description\":\"Bad Request: chat not found\"}";
    assertThatThrownBy(() -> bot.send(1L, "текст")).isInstanceOf(TelegramUnavailable.class)
      .hasMessageContaining("sendMessage").hasMessageContaining("chat not found").hasMessageNotContaining(BOT_TOKEN).hasNoCause();
    BOT_API.answer = "<html>";
    assertThatThrownBy(() -> bot.send(1L, "текст")).isInstanceOf(TelegramUnavailable.class).hasMessageNotContaining(BOT_TOKEN);
  }

  record Call(String path, String body) {
  }

  static final class BotApi {

    final List<Call> calls = new CopyOnWriteArrayList<>();
    volatile String answer = "{\"ok\":true,\"result\":true}";
    private final HttpServer server;

    BotApi() {
      try {
        server = HttpServer.create(new InetSocketAddress(java.net.InetAddress.getLoopbackAddress(), 0), 0);
      } catch (IOException failure) {
        throw new IllegalStateException(failure);
      }
      server.createContext("/", exchange -> {
        calls.add(new Call(exchange.getRequestURI().getPath(), new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
        byte[] reply = answer.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, reply.length);
        exchange.getResponseBody().write(reply);
        exchange.close();
      });
      server.start();
    }

    String base() {
      return "http://127.0.0.1:" + server.getAddress().getPort();
    }
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

    // REQ-TELEGRAM-008
    @Bean
    TelegramReplies telegramReplies() {
      return new TelegramReplies() {
        @Override
        public Optional<String> linked(String language) {
          return Optional.of("связано " + language);
        }

        @Override
        public Optional<String> refused(String language) {
          return Optional.of("отказ " + language);
        }
      };
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

    @Bean
    ApiAccess apiAccess() {
      return rules -> rules.requestMatchers("/api/**").denyAll();
    }

    @Bean
    @Primary
    MutableClock clock() {
      return MutableClock.at("2026-11-16T10:00:00Z");
    }
  }
}
