package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.auth.AccessKey;
import io.github.apocarteres.platform.auth.AccessKeys;
import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.auth.EntryAccess;
import io.github.apocarteres.platform.auth.HumanCheck;
import io.github.apocarteres.platform.auth.KeyAccess;
import io.github.apocarteres.platform.auth.NoProfile;
import io.github.apocarteres.platform.auth.RegistrationHook;
import io.github.apocarteres.platform.auth.UsedKey;
import io.github.apocarteres.platform.time.MutableClock;
import jakarta.servlet.Filter;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-AUTH-028, REQ-AUTH-029, REQ-AUTH-030, REQ-AUTH-031, REQ-AUTH-032, REQ-AUTH-033, REQ-AUTH-034, REQ-AUTH-036
@SpringBootTest(
  classes = AccessKeyFlowTest.Service.class,
  properties = {
    "platform.auth.roles=USER,ADMIN",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
    "platform.auth.keys.enabled=true",
    "platform.auth.keys.max-days=90",
    "platform.auth.keys.max-per-account=3",
    "platform.auth.keys.requests-per-minute=6",
    "platform.auth.keys.changes-per-minute=2",
    "platform.auth.headers.hsts.max-age=1d",
    "platform.auth.headers.hsts.include-sub-domains=false",
  }
)
class AccessKeyFlowTest {

  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
  private static final String PASSWORD = "correct horse battery";
  private static final JsonMapper JSON = JsonMapper.builder().build();

  static {
    POSTGRES.start();
    REDIS.start();
    try (var connection = java.sql.DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
      var statement = connection.createStatement()) {
      for (String table : List.of("create-account", "create-role", "create-token", "create-access-key")) {
        try (var input = AccessKeyFlowTest.class.getResourceAsStream("/sql/platform-auth/" + table + ".sql")) {
          statement.execute(new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
        }
      }
    } catch (java.sql.SQLException | java.io.IOException failure) {
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
  }

  @Autowired
  private WebApplicationContext context;
  @Autowired
  private MutableClock clock;
  @Autowired
  private Accounts accounts;
  @Autowired
  private AccessKeys keys;
  @Autowired
  private StringRedisTemplate redis;
  @Autowired
  private DataSource source;

  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    JdbcClient.create(source).sql("DELETE FROM platform_account").update();
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    mvc = MockMvcBuilders.webAppContextSetup(context)
      .addFilters(context.getBean("springSessionRepositoryFilter", Filter.class), context.getBean("springSecurityFilterChain", Filter.class))
      .build();
  }

  final class Visitor {

    private final List<Cookie> cookies = new ArrayList<>();
    private String csrf;

    Visitor() throws Exception {
      MockHttpServletResponse response = mvc.perform(MockMvcRequestBuilders.get("/api/auth/csrf")).andExpect(status().isOk()).andReturn().getResponse();
      keep(response);
      csrf = response.getContentAsString().replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    ResultActions post(String path, String json) throws Exception {
      return send(MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON).content(json).header("X-XSRF-TOKEN", csrf));
    }

    ResultActions get(String path) throws Exception {
      return send(MockMvcRequestBuilders.get(path));
    }

    ResultActions delete(String path) throws Exception {
      return send(MockMvcRequestBuilders.delete(path).header("X-XSRF-TOKEN", csrf));
    }

    ResultActions send(MockHttpServletRequestBuilder request) throws Exception {
      if (!cookies.isEmpty()) {
        request.cookie(cookies.toArray(Cookie[]::new));
      }
      ResultActions result = mvc.perform(request.with(r -> {
        r.setRemoteAddr("198.51.100.7");
        return r;
      }));
      keep(result.andReturn().getResponse());
      return result;
    }

    Cookie[] cookies() {
      return cookies.toArray(Cookie[]::new);
    }

    private void keep(MockHttpServletResponse response) {
      for (Cookie cookie : response.getCookies()) {
        cookies.removeIf(kept -> kept.getName().equals(cookie.getName()));
        if (cookie.getMaxAge() != 0) {
          cookies.add(cookie);
        }
      }
    }
  }

  private Account person(String email, String... roles) {
    return accounts.create(email, PASSWORD, Set.of(roles), true, new NoProfile());
  }

  private Visitor signedIn(String email) throws Exception {
    Visitor browser = new Visitor();
    browser.post("/api/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\",\"human\":\"human\"}")
      .andExpect(status().isOk());
    return browser;
  }

  private JsonNode issue(Visitor browser, String name, int days) throws Exception {
    String body = browser.post("/api/auth/keys", "{\"name\":\"" + name + "\",\"days\":" + days + "}")
      .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    return JSON.readTree(body);
  }

  private ResultActions byKey(String key, MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, "Bearer " + key).with(r -> {
      r.setRemoteAddr("203.0.113.9");
      return r;
    }));
  }

  @Test
  @DisplayName("Ключ выпускается сессией: значение один раз, с началом pak_, список без значения, пределы имени, срока и числа")
  void issuedOnceAndListedWithoutValue() throws Exception {
    person("owner@site.example", "USER");
    Visitor owner = signedIn("owner@site.example");

    JsonNode issued = issue(owner, "агент учёта", 30);
    String value = issued.get("value").asString();
    assertThat(value).startsWith("pak_").hasSize(4 + 43);
    assertThat(issued.get("name").asString()).isEqualTo("агент учёта");
    assertThat(issued.get("expiresAt").asString()).isEqualTo(clock.instant().plus(Duration.ofDays(30)).toString());

    String listed = owner.get("/api/auth/keys").andExpect(status().isOk())
      .andExpect(jsonPath("$[0].name").value("агент учёта"))
      .andReturn().getResponse().getContentAsString();
    assertThat(listed).doesNotContain(value).doesNotContain("\"value\"");
    String stored = JdbcClient.create(source).sql("SELECT digest FROM platform_access_key").query(String.class).single();
    assertThat(stored).as("хранится отпечаток, а не значение").isNotEqualTo(value).hasSize(64);

    owner.post("/api/auth/keys", "{\"name\":\"\",\"days\":30}").andExpect(status().isBadRequest())
      .andExpect(jsonPath("$.code").value("key-request-rejected"));
    owner.post("/api/auth/keys", "{\"name\":\"" + "я".repeat(101) + "\",\"days\":30}").andExpect(status().isBadRequest());
    owner.post("/api/auth/keys", "{\"name\":\"долгий\",\"days\":91}").andExpect(status().isBadRequest())
      .andExpect(jsonPath("$.code").value("key-request-rejected"));
    owner.post("/api/auth/keys", "{\"name\":\"пустой\",\"days\":0}").andExpect(status().isBadRequest());
    issue(owner, "второй", 90);
    issue(owner, "третий", 1);
    owner.post("/api/auth/keys", "{\"name\":\"четвёртый\",\"days\":1}").andExpect(status().isBadRequest())
      .andExpect(jsonPath("$.code").value("key-request-rejected"));

    new Visitor().post("/api/auth/keys", "{\"name\":\"чужой\",\"days\":1}").andExpect(status().isUnauthorized());
  }

  @Test
  @DisplayName("Запрос по ключу: от лица владельца, без сессии и CSRF, ключ узнаётся в коде проекта")
  void requestByKeyActsForTheOwner() throws Exception {
    Account owner = person("owner@site.example", "USER");
    JsonNode issued = issue(signedIn("owner@site.example"), "скрипт", 30);
    String key = issued.get("value").asString();

    MockHttpServletResponse read = byKey(key, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isOk()).andReturn().getResponse();
    assertThat(read.getContentAsString()).isEqualTo(owner.id().toString());
    assertThat(read.getCookies()).as("сессии запрос по ключу не создаёт").isEmpty();
    assertThat(read.getHeader(HttpHeaders.SET_COOKIE)).isNull();

    byKey(key, MockMvcRequestBuilders.post("/api/things")).andExpect(status().isOk());
    byKey(key, MockMvcRequestBuilders.get("/api/key-name")).andExpect(status().isOk())
      .andExpect(result -> assertThat(result.getResponse().getContentAsString())
        .isEqualTo(issued.get("id").asString() + " скрипт"));
    signedIn("owner@site.example").get("/api/key-name").andExpect(status().isOk())
      .andExpect(result -> assertThat(result.getResponse().getContentAsString()).isEqualTo("сессия"));
  }

  @Test
  @DisplayName("Cookie при ключе не читается: действует владелец ключа, а неверный ключ не падает на сессию")
  void cookieIsIgnoredWithAKey() throws Exception {
    Account first = person("first@site.example", "USER");
    Account second = person("second@site.example", "USER");
    Visitor firstBrowser = signedIn("first@site.example");
    String secondKey = issue(signedIn("second@site.example"), "второй", 30).get("value").asString();

    byKey(secondKey, MockMvcRequestBuilders.get("/api/things").cookie(firstBrowser.cookies())).andExpect(status().isOk())
      .andExpect(result -> assertThat(result.getResponse().getContentAsString()).isEqualTo(second.id().toString()));
    byKey("pak_неверный", MockMvcRequestBuilders.get("/api/things").cookie(firstBrowser.cookies()))
      .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("key-rejected"));
    firstBrowser.get("/api/things").andExpect(result -> assertThat(result.getResponse().getContentAsString()).isEqualTo(first.id().toString()));
  }

  @Test
  @DisplayName("По ключу открыто только разрешённое проектом, а точки аутентификации ядра закрыты всегда")
  void onlyOpenedPointsAreReachable() throws Exception {
    person("owner@site.example", "USER", "ADMIN");
    String key = issue(signedIn("owner@site.example"), "агент", 30).get("value").asString();

    byKey(key, MockMvcRequestBuilders.get("/api/admin/panel")).andExpect(status().isOk());
    byKey(key, MockMvcRequestBuilders.get("/api/closed")).andExpect(status().isForbidden())
      .andExpect(jsonPath("$.code").value("key-closed"));
    byKey(key, MockMvcRequestBuilders.get("/api/auth/me")).andExpect(status().isForbidden())
      .andExpect(jsonPath("$.code").value("key-closed"));
    byKey(key, MockMvcRequestBuilders.get("/api/auth/keys")).andExpect(status().isForbidden())
      .andExpect(jsonPath("$.code").value("key-closed"));
    byKey(key, MockMvcRequestBuilders.post("/api/auth/keys").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"ещё\",\"days\":1}"))
      .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("key-closed"));
    for (String twisted : List.of("/api//auth/keys", "/api/auth//keys", "/api/./auth/keys", "/api/x/../auth/keys", "/api/auth/keys/")) {
      int answered = byKey(key, MockMvcRequestBuilders.post(twisted).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"обход\",\"days\":1}"))
        .andReturn().getResponse().getStatus();
      assertThat(answered).as(twisted).isBetween(400, 499);
    }
    assertThat(JdbcClient.create(source).sql("SELECT count(*) FROM platform_access_key").query(Long.class).single())
      .as("ключ ключей не выпускает").isEqualTo(1);
  }

  @Test
  @DisplayName("Неизвестный, отозванный и истёкший ключ отказывают; блокировка и снятая роль действуют сразу")
  void rejectedKeys() throws Exception {
    Account owner = person("owner@site.example", "USER", "ADMIN");
    Visitor browser = signedIn("owner@site.example");
    JsonNode first = issue(browser, "первый", 30);
    String key = first.get("value").asString();

    byKey("pak_" + "A".repeat(43), MockMvcRequestBuilders.get("/api/things")).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("key-rejected"));

    byKey(key, MockMvcRequestBuilders.get("/api/admin/panel")).andExpect(status().isOk());
    accounts.revoke(owner.id(), "ADMIN");
    byKey(key, MockMvcRequestBuilders.get("/api/admin/panel")).andExpect(status().isForbidden())
      .andExpect(jsonPath("$.code").value("access-denied"));

    accounts.block(owner.id());
    byKey(key, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isForbidden())
      .andExpect(jsonPath("$.code").value("account-blocked"));
    accounts.unblock(owner.id());
    byKey(key, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isOk());

    browser = signedIn("owner@site.example");
    browser.delete("/api/auth/keys/" + first.get("id").asString()).andExpect(status().isNoContent());
    byKey(key, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("key-rejected"));

    String short1 = issue(browser, "короткий", 1).get("value").asString();
    String short2 = issue(browser, "второй короткий", 2).get("value").asString();
    clock.advance(Duration.ofDays(1).plusSeconds(1));
    byKey(short1, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("key-rejected"));
    byKey(short2, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isOk());

    browser = signedIn("owner@site.example");
    browser.delete("/api/auth/keys").andExpect(status().isNoContent());
    byKey(short2, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isUnauthorized());
    assertThat(keys.list(owner.id())).isEmpty();

    Account unverified = accounts.create("pending@site.example", PASSWORD, Set.of("USER"), false, new NoProfile());
    String pending = keys.issue(unverified.id(), "выпущен портом", 5).value();
    byKey(pending, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isForbidden())
      .andExpect(jsonPath("$.code").value("email-unverified"));
  }

  @Test
  @DisplayName("Пределы частоты — на каждый ключ: все запросы и отдельно изменяющие")
  void limitsPerKey() throws Exception {
    person("owner@site.example", "USER");
    Visitor browser = signedIn("owner@site.example");
    String first = issue(browser, "первый", 30).get("value").asString();
    String second = issue(browser, "второй", 30).get("value").asString();

    byKey(first, MockMvcRequestBuilders.post("/api/things")).andExpect(status().isOk());
    byKey(first, MockMvcRequestBuilders.post("/api/things")).andExpect(status().isOk());
    byKey(first, MockMvcRequestBuilders.post("/api/things")).andExpect(status().isTooManyRequests())
      .andExpect(jsonPath("$.code").value("rate-limited"));
    byKey(second, MockMvcRequestBuilders.post("/api/things")).andExpect(status().isOk());

    for (int read = 0; read < 3; read++) {
      byKey(first, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isOk());
    }
    byKey(first, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isTooManyRequests());
    byKey(second, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isOk());
  }

  @Test
  @DisplayName("Последнее использование пишется не чаще раза в минуту; истёкшие ключи удаляет purgeTokens; порт отзывает все")
  void lastUseAndCleanup() throws Exception {
    Account owner = person("owner@site.example", "USER");
    Visitor browser = signedIn("owner@site.example");
    String key = issue(browser, "агент", 30).get("value").asString();
    issue(browser, "короткий", 1);
    assertThat(keys.list(owner.id())).extracting(AccessKey::lastUsedAt).containsOnlyNulls();

    byKey(key, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isOk());
    var used = clock.instant();
    clock.advance(Duration.ofSeconds(30));
    byKey(key, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isOk());
    assertThat(keys.list(owner.id())).filteredOn(one -> one.name().equals("агент")).extracting(AccessKey::lastUsedAt).containsExactly(used);
    clock.advance(Duration.ofSeconds(31));
    byKey(key, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isOk());
    assertThat(keys.list(owner.id())).filteredOn(one -> one.name().equals("агент")).extracting(AccessKey::lastUsedAt)
      .containsExactly(clock.instant());

    clock.advance(Duration.ofDays(3));
    accounts.purgeTokens(Duration.ofDays(1));
    assertThat(keys.list(owner.id())).extracting(AccessKey::name).containsExactly("агент");

    assertThat(keys.revokeAll(owner.id())).isEqualTo(1);
    byKey(key, MockMvcRequestBuilders.get("/api/things")).andExpect(status().isUnauthorized());

    keys.issue(owner.id(), "перед удалением", 5);
    accounts.delete(owner.id());
    assertThat(JdbcClient.create(source).sql("SELECT count(*) FROM platform_access_key").query(Long.class).single())
      .as("удаление учётной записи удаляет её ключи").isZero();
  }

  // REQ-AUTH-036
  @Test
  @DisplayName("Срок и поддомены HSTS задаёт проект: сутки без поддоменов")
  void hstsIsConfigured() throws Exception {
    mvc.perform(MockMvcRequestBuilders.get("/api/auth/policy").secure(true))
      .andExpect(result -> assertThat(result.getResponse().getHeader("Strict-Transport-Security")).isEqualTo("max-age=86400"));
  }

  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration
  static class Service {

    @Bean
    AuthLetters letters() {
      return new AuthLetters() {
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
      };
    }

    @Bean
    RegistrationHook<NoProfile> hook() {
      return RegistrationHook.NONE;
    }

    @Bean
    EntryAccess entryAccess() {
      return EntryAccess.OPEN;
    }

    @Bean
    HumanCheck humanCheck() {
      return (answer, action, address) -> "human".equals(answer);
    }

    @Bean
    io.github.apocarteres.platform.auth.ApiAccess apiAccess() {
      return rules -> rules.requestMatchers("/api/admin/**").hasRole("ADMIN");
    }

    // REQ-AUTH-031
    @Bean
    KeyAccess keyAccess() {
      Set<String> opened = Set.of("/api/things", "/api/key-name", "/api/admin/panel", "/api/auth/me", "/api/auth/keys");
      return request -> opened.contains(request.getRequestURI());
    }

    @Bean
    @Primary
    MutableClock clock() {
      return MutableClock.at("2026-09-27T10:00:00Z");
    }

    @Bean
    Things things() {
      return new Things();
    }
  }

  @RestController
  static class Things {

    @GetMapping({"/api/things", "/api/closed"})
    String things() {
      return CurrentAccount.id().map(UUID::toString).orElse("none");
    }

    @PostMapping("/api/things")
    String change() {
      return "изменено";
    }

    @GetMapping("/api/key-name")
    String keyName() {
      return CurrentAccount.key().map(UsedKey::id).map(id -> id + " " + CurrentAccount.key().map(UsedKey::name).orElseThrow()).orElse("сессия");
    }

    @GetMapping("/api/admin/panel")
    String panel() {
      return "панель";
    }
  }
}
