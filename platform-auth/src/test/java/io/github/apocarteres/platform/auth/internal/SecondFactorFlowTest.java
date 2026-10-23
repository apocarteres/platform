package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.ApiAccess;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.auth.EntryAccess;
import io.github.apocarteres.platform.auth.HumanCheck;
import io.github.apocarteres.platform.auth.NoProfile;
import io.github.apocarteres.platform.auth.RegistrationHook;
import io.github.apocarteres.platform.auth.SecondFactor;
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
import org.springframework.data.redis.connection.DataType;
import org.springframework.data.redis.core.StringRedisTemplate;
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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

// REQ-AUTH-041, REQ-AUTH-042, REQ-AUTH-043
@SpringBootTest(
  classes = SecondFactorFlowTest.Service.class,
  properties = {
    "spring.liquibase.enabled=false",
    "platform.auth.roles=USER,ADMIN",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
  }
)
class SecondFactorFlowTest {

  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
  private static final String PASSWORD = "correct horse battery";
  private static final String CODE = "123456";

  static {
    POSTGRES.start();
    REDIS.start();
    try (var connection = java.sql.DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
      changelogs(connection, "platform/changelog/platform-auth.yaml");
    } catch (java.sql.SQLException | liquibase.exception.LiquibaseException failure) {
      throw new IllegalStateException(failure);
    }
  }

  // REQ-DATA-ACCESS-007
  private static void changelogs(java.sql.Connection connection, String... files) throws liquibase.exception.LiquibaseException, java.sql.SQLException {
    liquibase.database.Database database = liquibase.database.DatabaseFactory.getInstance()
      .findCorrectDatabaseImplementation(new liquibase.database.jvm.JdbcConnection(connection));
    for (String file : files) {
      new liquibase.Liquibase(file, new liquibase.resource.ClassLoaderResourceAccessor(), database)
        .update(new liquibase.Contexts(), new liquibase.LabelExpression());
    }
    connection.setAutoCommit(true);
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
  private Accounts accounts;
  @Autowired
  private StringRedisTemplate redis;
  @Autowired
  private DataSource source;
  @Autowired
  private MutableClock clock;
  @Autowired
  private Codes codes;

  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    JdbcClient.create(source).sql("DELETE FROM platform_account").update();
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    codes.checked.clear();
    mvc = MockMvcBuilders.webAppContextSetup(context)
      .addFilters(context.getBean("springSessionRepositoryFilter", Filter.class), context.getBean("springSecurityFilterChain", Filter.class))
      .build();
  }

  final class Client {

    private final List<Cookie> cookies = new ArrayList<>();
    private final String csrf;

    Client() throws Exception {
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

    ResultActions send(MockHttpServletRequestBuilder request) throws Exception {
      if (!cookies.isEmpty()) {
        request.cookie(cookies.toArray(Cookie[]::new));
      }
      ResultActions result = mvc.perform(request);
      keep(result.andReturn().getResponse());
      return result;
    }

    private void keep(MockHttpServletResponse response) {
      for (Cookie cookie : response.getCookies()) {
        cookies.removeIf(kept -> kept.getName().equals(cookie.getName()));
        if (cookie.getMaxAge() != 0) {
          cookies.add(cookie);
        }
      }
    }

    String session() {
      return cookies.stream().filter(cookie -> cookie.getName().equals("SESSION")).map(Cookie::getValue).findFirst().orElse(null);
    }

    ResultActions login(String email, String password) throws Exception {
      return post("/api/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"human\":\"human\"}");
    }

    ResultActions code(String code) throws Exception {
      return post("/api/auth/login/second-factor", "{\"code\":\"" + code + "\"}");
    }
  }

  private Account admin() {
    return accounts.create("admin@site.example", PASSWORD, Set.of("USER", "ADMIN"), true, new NoProfile());
  }

  @Test
  @DisplayName("Пароль верен — отказ second-factor-required: сессии нет, защищённые пути 401; верный код завершает вход")
  void passwordThenCode() throws Exception {
    Account admin = admin();
    Client browser = new Client();
    browser.login("admin@site.example", PASSWORD)
      .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("second-factor-required"));
    String pending = browser.session();
    assertThat(pending).as("ожидающий вход держится в сессии").isNotNull();
    browser.get("/api/auth/session").andExpect(status().isOk()).andExpect(jsonPath("$.account").isEmpty());
    browser.get("/api/things").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("authentication-required"));
    browser.get("/api/auth/me").andExpect(status().isUnauthorized());
    assertThat(accounts.find(admin.id()).orElseThrow().lastLoginAt()).as("время входа — только после второго шага").isNull();
    assertThat(sessionValues()).isNotEmpty().noneMatch(value -> value.contains("admin@site.example"));

    browser.code("000000").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("second-factor-rejected"));
    browser.get("/api/things").andExpect(status().isUnauthorized());
    browser.code(CODE)
      .andExpect(status().isOk()).andExpect(jsonPath("$.email").value("admin@site.example")).andExpect(jsonPath("$.roles.length()").value(2));
    assertThat(codes.checked).containsExactly(admin.id(), admin.id());
    assertThat(browser.session()).as("завершение входа меняет идентификатор сессии").isNotNull().isNotEqualTo(pending);
    browser.get("/api/things").andExpect(status().isOk())
      .andExpect(result -> assertThat(result.getResponse().getContentAsString()).isEqualTo(admin.id().toString()));
    browser.get("/api/admin/panel").andExpect(status().isOk());
    browser.get("/api/auth/session").andExpect(jsonPath("$.account.email").value("admin@site.example"));
    assertThat(accounts.find(admin.id()).orElseThrow().lastLoginAt()).isEqualTo(clock.instant());

    browser.code(CODE).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("second-factor-expired"));
  }

  @Test
  @DisplayName("Учётной записи, которой порт второй шаг не требует, вход прежний: код порт не спрашивает")
  void accountWithoutSecondStep() throws Exception {
    accounts.create("user@site.example", PASSWORD, Set.of("USER"), true, new NoProfile());
    Client browser = new Client();
    browser.login("user@site.example", PASSWORD).andExpect(status().isOk()).andExpect(jsonPath("$.email").value("user@site.example"));
    browser.get("/api/things").andExpect(status().isOk());
    assertThat(codes.checked).isEmpty();
  }

  @Test
  @DisplayName("Ожидающий вход живёт 5 минут; без него и после срока — second-factor-expired, и верный код уже не помогает")
  void pendingExpires() throws Exception {
    admin();
    new Client().code(CODE).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("second-factor-expired"));

    Client browser = new Client();
    browser.login("admin@site.example", PASSWORD).andExpect(jsonPath("$.code").value("second-factor-required"));
    clock.advance(Duration.ofMinutes(5));
    browser.code(CODE).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("second-factor-expired"));
    clock.advance(Duration.ofMinutes(-5));
    browser.code(CODE).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("second-factor-expired"));
    browser.get("/api/things").andExpect(status().isUnauthorized());
    assertThat(codes.checked).isEmpty();

    browser.login("admin@site.example", PASSWORD).andExpect(jsonPath("$.code").value("second-factor-required"));
    clock.advance(Duration.ofMinutes(4));
    browser.code(CODE).andExpect(status().isOk());
  }

  @Test
  @DisplayName("Неверные коды и неверные пароли считаются одним пределом неудач входа")
  void wrongCodesShareTheLoginLimit() throws Exception {
    admin();
    Client browser = new Client();
    for (int attempt = 0; attempt < 5; attempt++) {
      browser.login("admin@site.example", "wrong password here").andExpect(jsonPath("$.code").value("credentials-rejected"));
    }
    browser.login("admin@site.example", PASSWORD).andExpect(jsonPath("$.code").value("second-factor-required"));
    for (int attempt = 0; attempt < 5; attempt++) {
      browser.code("000000").andExpect(jsonPath("$.code").value("second-factor-rejected"));
    }
    browser.code(CODE).andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("rate-limited"));
    new Client().login("admin@site.example", PASSWORD).andExpect(status().isTooManyRequests());
    browser.get("/api/things").andExpect(status().isUnauthorized());
  }

  @Test
  @DisplayName("Запись, заблокированная между шагами, входа не получает, и ожидающий вход снят")
  void blockedBetweenSteps() throws Exception {
    Account admin = admin();
    Client browser = new Client();
    browser.login("admin@site.example", PASSWORD).andExpect(jsonPath("$.code").value("second-factor-required"));
    accounts.block(admin.id());
    browser.code(CODE).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("account-blocked"));
    accounts.unblock(admin.id());
    browser.code(CODE).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("second-factor-expired"));
    browser.get("/api/things").andExpect(status().isUnauthorized());
  }

  @Test
  @DisplayName("Ожидающий вход заменяет прежний вход в той же сессии; удачный вход без второго шага снимает ожидание")
  void pendingReplacesTheSignedInAccount() throws Exception {
    admin();
    accounts.create("user@site.example", PASSWORD, Set.of("USER"), true, new NoProfile());
    Client browser = new Client();
    browser.login("user@site.example", PASSWORD).andExpect(status().isOk());
    browser.login("admin@site.example", PASSWORD).andExpect(jsonPath("$.code").value("second-factor-required"));
    browser.get("/api/auth/session").andExpect(jsonPath("$.account").isEmpty());
    browser.get("/api/things").andExpect(status().isUnauthorized());

    browser.login("user@site.example", PASSWORD).andExpect(status().isOk());
    browser.code(CODE).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("second-factor-expired"));
    browser.get("/api/auth/session").andExpect(jsonPath("$.account.email").value("user@site.example"));
  }

  @Test
  @DisplayName("Второй шаг — изменяющий запрос: без токена CSRF отказ csrf-rejected")
  void secondStepRequiresCsrf() throws Exception {
    mvc.perform(MockMvcRequestBuilders.post("/api/auth/login/second-factor").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"1\"}"))
      .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("csrf-rejected"));
  }

  private List<String> sessionValues() {
    List<String> values = new ArrayList<>();
    for (String key : redis.keys("*")) {
      if (redis.type(key) == DataType.HASH) {
        redis.opsForHash().entries(key).forEach((name, value) -> values.add(name + "=" + value));
      }
    }
    return values;
  }

  static final class Codes implements SecondFactor {

    final List<UUID> checked = new CopyOnWriteArrayList<>();

    @Override
    public boolean required(Account account) {
      return account.has("ADMIN");
    }

    @Override
    public boolean verify(UUID account, String code) {
      checked.add(account);
      return CODE.equals(code);
    }
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
    ApiAccess apiAccess() {
      return rules -> rules.requestMatchers("/api/admin/**").hasRole("ADMIN");
    }

    // REQ-AUTH-041
    @Bean
    Codes codes() {
      return new Codes();
    }

    @Bean
    @Primary
    MutableClock clock() {
      return MutableClock.at("2026-10-23T10:00:00Z");
    }

    @Bean
    Things things() {
      return new Things();
    }
  }

  @RestController
  static class Things {

    @GetMapping("/api/things")
    String things() {
      return CurrentAccount.id().map(UUID::toString).orElse("none");
    }

    @GetMapping("/api/admin/panel")
    String panel() {
      return "панель";
    }
  }
}
