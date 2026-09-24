package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.ApiAccess;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.auth.HumanCheck;
import io.github.apocarteres.platform.auth.RegistrationHook;
import io.github.apocarteres.platform.time.MutableClock;
import jakarta.servlet.Filter;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

// REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004, REQ-AUTH-005, REQ-AUTH-006, REQ-AUTH-007, REQ-AUTH-008,
// REQ-AUTH-009, REQ-AUTH-010, REQ-AUTH-012, REQ-AUTH-013, REQ-AUTH-014
@SpringBootTest(
  classes = AuthFlowTest.Service.class,
  properties = {
    "platform.auth.roles=USER,ADMIN",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
    "platform.auth.admin.email=Admin@Site.Example",
    "platform.auth.admin.password=initial-admin-password",
    "platform.auth.admin.roles=USER,ADMIN",
  }
)
class AuthFlowTest {

  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

  static {
    POSTGRES.start();
    REDIS.start();
    schema();
  }

  static void schema() {
    try (var connection = java.sql.DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
      var statement = connection.createStatement()) {
      for (String table : List.of("create-account", "create-role", "create-token")) {
        try (var input = AuthFlowTest.class.getResourceAsStream("/sql/platform-auth/" + table + ".sql")) {
          statement.execute(new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
        }
      }
    } catch (java.sql.SQLException | java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
  }

  private static final Pattern TOKEN = Pattern.compile("token=([A-Za-z0-9_-]+)");
  private static final String PASSWORD = "correct horse battery";

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
  private Letters letters;
  @Autowired
  private Hook hook;
  @Autowired
  private MutableClock clock;
  @Autowired
  private Accounts accounts;
  @Autowired
  private StringRedisTemplate redis;
  @Autowired
  private DataSource source;

  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    JdbcClient jdbc = JdbcClient.create(source);
    jdbc.sql("DELETE FROM platform_account WHERE email <> 'admin@site.example'").update();
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    letters.sent.clear();
    hook.seen.clear();
    hook.failing = false;
    mvc = MockMvcBuilders.webAppContextSetup(context)
      .addFilters(context.getBean("springSessionRepositoryFilter", Filter.class), context.getBean("springSecurityFilterChain", Filter.class))
      .build();
  }

  final class Browser {

    private final List<Cookie> cookies = new ArrayList<>();
    private String csrf;

    Browser() throws Exception {
      MockHttpServletResponse response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/auth/csrf")).andExpect(status().isOk()).andReturn().getResponse();
      keep(response);
      csrf = response.getContentAsString().replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    ResultActions post(String path, String json) throws Exception {
      return send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
        .contentType(MediaType.APPLICATION_JSON).content(json).header("X-XSRF-TOKEN", csrf));
    }

    ResultActions get(String path) throws Exception {
      return send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path));
    }

    private ResultActions send(MockHttpServletRequestBuilder request) throws Exception {
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
  }

  private static String login(String email, String password) {
    return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"human\":\"human\"}";
  }

  private String token(int letter) {
    Matcher found = TOKEN.matcher(letters.sent.get(letter).link().toString());
    assertThat(found.find()).isTrue();
    return found.group(1);
  }

  private Browser registered(String email) throws Exception {
    Browser browser = new Browser();
    browser.post("/api/auth/register", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD
      + "\",\"human\":\"human\",\"profile\":{\"name\":\"Игрок\"}}").andExpect(status().isAccepted());
    browser.post("/api/auth/verify", "{\"token\":\"" + token(letters.sent.size() - 1) + "\"}").andExpect(status().isNoContent());
    return browser;
  }

  @Test
  @DisplayName("Регистрация, подтверждение, вход и выход: роль по умолчанию, профиль проекту, письмо после фиксации")
  void fullCycle() throws Exception {
    Browser browser = new Browser();
    browser.post("/api/auth/register", "{\"email\":\" New@Player.Example \",\"password\":\"" + PASSWORD
      + "\",\"human\":\"human\",\"profile\":{\"name\":\"Игрок\"}}").andExpect(status().isAccepted());
    assertThat(letters.sent).hasSize(1);
    assertThat(letters.sent.get(0).inTransaction()).as("письмо уходит после фиксации, вне транзакции").isFalse();
    assertThat(letters.sent.get(0).email()).isEqualTo("new@player.example");
    assertThat(letters.sent.get(0).link().toString()).startsWith("https://site.example/auth/verify?token=");
    assertThat(hook.seen).singleElement().satisfies(seen -> {
      assertThat(seen.account().email()).isEqualTo("new@player.example");
      assertThat(seen.profile()).containsEntry("name", "Игрок");
    });

    browser.post("/api/auth/login", login("new@player.example", "wrong password here"))
      .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("credentials-rejected"));
    browser.post("/api/auth/login", login("new@player.example", PASSWORD))
      .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("email-unverified"));
    browser.post("/api/auth/verify", "{\"token\":\"" + token(0) + "\"}").andExpect(status().isNoContent());
    browser.post("/api/auth/verify", "{\"token\":\"" + token(0) + "\"}")
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("token-rejected"));

    String before = browser.session();
    browser.post("/api/auth/login", login("NEW@player.example", PASSWORD))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.email").value("new@player.example"))
      .andExpect(jsonPath("$.roles[0]").value("USER"));
    assertThat(browser.session()).as("вход меняет идентификатор сессии").isNotNull().isNotEqualTo(before);
    browser.get("/api/things").andExpect(status().isOk());
    String first = browser.session();
    browser.post("/api/auth/login", login("new@player.example", PASSWORD)).andExpect(status().isOk());
    assertThat(browser.session()).as("повторный вход тоже меняет идентификатор сессии").isNotEqualTo(first);
    browser.get("/api/auth/me").andExpect(status().isOk()).andExpect(jsonPath("$.email").value("new@player.example"));
    browser.get("/api/admin/panel").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("access-denied"));
    assertThat(accounts.findByEmail("new@player.example")).get().extracting(Account::lastLoginAt).isEqualTo(clock.instant());

    browser.post("/api/auth/logout", "{}").andExpect(status().isNoContent());
    browser.get("/api/things").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("authentication-required"));
  }

  @Test
  @DisplayName("Повторная регистрация отвечает так же и ничего не шлёт: ответ не раскрывает почту")
  void registrationDoesNotRevealTheEmail() throws Exception {
    registered("taken@player.example");
    Browser other = new Browser();
    other.post("/api/auth/register", "{\"email\":\"taken@player.example\",\"password\":\"" + PASSWORD + "\",\"human\":\"human\"}")
      .andExpect(status().isAccepted());
    other.post("/api/auth/password-reset/request", "{\"email\":\"nobody@player.example\",\"human\":\"human\"}")
      .andExpect(status().isAccepted());
    other.post("/api/auth/resend", "{\"email\":\"nobody@player.example\"}").andExpect(status().isAccepted());
    assertThat(letters.sent).hasSize(1);
    other.post("/api/auth/login", login("nobody@player.example", PASSWORD))
      .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("credentials-rejected"));
    other.post("/api/auth/login", login("taken@player.example", "wrong password here"))
      .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("credentials-rejected"));
  }

  @Test
  @DisplayName("Повторное письмо не чаще раза в минуту, и действует только последняя ссылка")
  void onlyTheLatestLinkWorks() throws Exception {
    Browser browser = new Browser();
    browser.post("/api/auth/register", "{\"email\":\"again@player.example\",\"password\":\"" + PASSWORD + "\",\"human\":\"human\"}");
    String first = token(0);
    browser.post("/api/auth/resend", "{\"email\":\"again@player.example\"}").andExpect(status().isAccepted());
    assertThat(letters.sent).as("раньше минуты второго письма нет").hasSize(1);
    clock.advance(Duration.ofMinutes(2));
    browser.post("/api/auth/resend", "{\"email\":\"again@player.example\"}").andExpect(status().isAccepted());
    assertThat(letters.sent).hasSize(2);
    browser.post("/api/auth/verify", "{\"token\":\"" + first + "\"}").andExpect(jsonPath("$.code").value("token-rejected"));
    browser.post("/api/auth/verify", "{\"token\":\"" + token(1) + "\"}").andExpect(status().isNoContent());
  }

  @Test
  @DisplayName("Письмо не уходит, если регистрация откатилась")
  void lettersWaitForTheCommit() throws Exception {
    hook.failing = true;
    Browser browser = new Browser();
    browser.post("/api/auth/register", "{\"email\":\"rolled@player.example\",\"password\":\"" + PASSWORD + "\",\"human\":\"human\"}")
      .andExpect(status().is5xxServerError());
    assertThat(letters.sent).isEmpty();
    assertThat(accounts.findByEmail("rolled@player.example")).isEmpty();
  }

  @Test
  @DisplayName("Изменяющий запрос без токена CSRF отказывает кодом csrf-rejected")
  void csrfIsRequired() throws Exception {
    mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login("a@b.example", PASSWORD)))
      .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("csrf-rejected"));
  }

  @Test
  @DisplayName("Неудачные входы по почте ограничены, удачный вход счёт сбрасывает")
  void failedLoginsAreLimited() throws Exception {
    Browser browser = registered("limited@player.example");
    for (int attempt = 0; attempt < 9; attempt++) {
      browser.post("/api/auth/login", login("limited@player.example", "wrong password here")).andExpect(status().isUnauthorized());
    }
    browser.post("/api/auth/login", login("limited@player.example", PASSWORD)).andExpect(status().isOk());
    for (int attempt = 0; attempt < 10; attempt++) {
      browser.post("/api/auth/login", login("limited@player.example", "wrong password here")).andExpect(status().isUnauthorized());
    }
    browser.post("/api/auth/login", login("limited@player.example", PASSWORD))
      .andExpect(status().isTooManyRequests())
      .andExpect(jsonPath("$.code").value("rate-limited"));
  }

  @Test
  @DisplayName("Сброс пароля: слабый пароль отвергнут, новый действует, старые сессии завершены, ссылка одноразовая и со сроком")
  void passwordReset() throws Exception {
    Browser signedIn = registered("reset@player.example");
    signedIn.post("/api/auth/login", login("reset@player.example", PASSWORD)).andExpect(status().isOk());
    signedIn.get("/api/things").andExpect(status().isOk());

    Browser browser = new Browser();
    browser.post("/api/auth/password-reset/request", "{\"email\":\"reset@player.example\",\"human\":\"human\"}")
      .andExpect(status().isAccepted());
    String token = token(letters.sent.size() - 1);
    assertThat(letters.sent.get(letters.sent.size() - 1).link().toString()).startsWith("https://site.example/auth/password-reset?token=");
    browser.post("/api/auth/password-reset/confirm", "{\"token\":\"" + token + "\",\"password\":\"short\"}")
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("password-rejected"));
    browser.post("/api/auth/password-reset/confirm", "{\"token\":\"" + token + "\",\"password\":\"another long password\"}")
      .andExpect(status().isNoContent());
    signedIn.get("/api/things").andExpect(status().isUnauthorized());
    browser.post("/api/auth/login", login("reset@player.example", PASSWORD)).andExpect(status().isUnauthorized());
    browser.post("/api/auth/login", login("reset@player.example", "another long password")).andExpect(status().isOk());
    browser.post("/api/auth/password-reset/confirm", "{\"token\":\"" + token + "\",\"password\":\"third long password\"}")
      .andExpect(jsonPath("$.code").value("token-rejected"));

    browser.post("/api/auth/password-reset/request", "{\"email\":\"reset@player.example\",\"human\":\"human\"}");
    String late = token(letters.sent.size() - 1);
    clock.advance(Duration.ofMinutes(31));
    browser.post("/api/auth/password-reset/confirm", "{\"token\":\"" + late + "\",\"password\":\"third long password\"}")
      .andExpect(jsonPath("$.code").value("token-rejected"));
  }

  @Test
  @DisplayName("Блокировка завершает сессии и закрывает вход; роли проекта, отзыв роли завершает сессии")
  void blockingAndRoles() throws Exception {
    Browser browser = registered("roles@player.example");
    browser.post("/api/auth/login", login("roles@player.example", PASSWORD)).andExpect(status().isOk());
    UUID id = accounts.findByEmail("roles@player.example").orElseThrow().id();

    accounts.grant(id, "ADMIN");
    browser.post("/api/auth/login", login("roles@player.example", PASSWORD)).andExpect(status().isOk());
    browser.get("/api/admin/panel").andExpect(status().isOk());
    accounts.revoke(id, "ADMIN");
    browser.get("/api/things").andExpect(status().isUnauthorized());

    browser.post("/api/auth/login", login("roles@player.example", PASSWORD)).andExpect(status().isOk());
    accounts.block(id);
    browser.get("/api/things").andExpect(status().isUnauthorized());
    browser.post("/api/auth/login", login("roles@player.example", PASSWORD))
      .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("account-blocked"));
    accounts.unblock(id);
    browser.post("/api/auth/login", login("roles@player.example", PASSWORD)).andExpect(status().isOk());
  }

  @Test
  @DisplayName("Первый администратор создан из настроек, подтверждён и получил объявленные роли")
  void adminIsProvisioned() throws Exception {
    Account admin = accounts.findByEmail("admin@site.example").orElseThrow();
    assertThat(admin.verified()).isTrue();
    assertThat(admin.roles()).containsExactlyInAnyOrder("USER", "ADMIN");
    Browser browser = new Browser();
    browser.post("/api/auth/login", login("admin@site.example", "initial-admin-password")).andExpect(status().isOk());
    browser.get("/api/admin/panel").andExpect(status().isOk());
  }

  @Test
  @DisplayName("Проверка «человек ли это» не пройдена — отказ до всякой работы")
  void humanCheckRefuses() throws Exception {
    Browser browser = new Browser();
    browser.post("/api/auth/register", "{\"email\":\"bot@player.example\",\"password\":\"" + PASSWORD + "\",\"human\":\"bot\"}")
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("human-check-failed"));
    assertThat(accounts.findByEmail("bot@player.example")).isEmpty();
  }

  @Test
  @DisplayName("В хранилище сессий нет почты: индекс по идентификатору учётной записи")
  void sessionStoreHoldsNoEmail() throws Exception {
    Browser browser = registered("private@player.example");
    browser.post("/api/auth/login", login("private@player.example", PASSWORD)).andExpect(status().isOk());
    List<String> keys = new ArrayList<>(redis.keys("*"));
    assertThat(keys).isNotEmpty().noneMatch(key -> key.contains("private@player.example"));
    assertThat(keys).anyMatch(key -> key.startsWith("platform:session:"));
  }

  @Test
  @DisplayName("Неподтверждённые учётные записи и отработавшие токены стираются явной командой")
  void purgeCommands() throws Exception {
    new Browser().post("/api/auth/register", "{\"email\":\"idle@player.example\",\"password\":\"" + PASSWORD + "\",\"human\":\"human\"}");
    registered("active@player.example");
    clock.advance(Duration.ofDays(8));
    assertThat(accounts.purgeTokens(Duration.ofDays(7))).isEqualTo(2);
    assertThat(accounts.purgeUnverified(Duration.ofDays(7))).isEqualTo(1);
    assertThat(accounts.findByEmail("idle@player.example")).isEmpty();
    assertThat(accounts.findByEmail("active@player.example")).isPresent();
  }

  record Letter(String email, URI link, Locale locale, boolean inTransaction) {
  }

  static final class Letters implements AuthLetters {

    final List<Letter> sent = new CopyOnWriteArrayList<>();

    @Override
    public void verification(String email, URI link, Locale locale) {
      sent.add(new Letter(email, link, locale, TransactionSynchronizationManager.isActualTransactionActive()));
    }

    @Override
    public void passwordReset(String email, URI link, Locale locale) {
      sent.add(new Letter(email, link, locale, TransactionSynchronizationManager.isActualTransactionActive()));
    }
  }

  record Seen(Account account, Map<String, Object> profile) {
  }

  static final class Hook implements RegistrationHook {

    final List<Seen> seen = new CopyOnWriteArrayList<>();
    volatile boolean failing;

    @Override
    public void registered(Account account, Map<String, Object> profile) {
      if (failing) {
        throw new IllegalStateException("профиль проекта не создан");
      }
      seen.add(new Seen(account, profile));
    }
  }

  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration
  static class Service {

    @Bean
    Letters letters() {
      return new Letters();
    }

    @Bean
    Hook hook() {
      return new Hook();
    }

    @Bean
    HumanCheck humanCheck() {
      return (answer, action, address) -> "human".equals(answer);
    }

    @Bean
    ApiAccess apiAccess() {
      return rules -> rules.requestMatchers("/api/admin/**").hasRole("ADMIN");
    }

    @Bean
    @Primary
    MutableClock clock() {
      return MutableClock.at("2026-09-24T10:00:00Z");
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
