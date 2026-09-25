package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.ApiAccess;
import io.github.apocarteres.platform.auth.AccountVerified;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.EmailChange;
import io.github.apocarteres.platform.auth.EntryAccess;
import io.github.apocarteres.platform.auth.Purged;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.auth.HumanCheck;
import io.github.apocarteres.platform.auth.ModuleApiAccess;
import io.github.apocarteres.platform.auth.RegistrationHook;
import io.github.apocarteres.platform.auth.Removal;
import io.github.apocarteres.platform.time.MutableClock;
import jakarta.servlet.Filter;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
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
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

// REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004, REQ-AUTH-005, REQ-AUTH-006, REQ-AUTH-007, REQ-AUTH-008,
// REQ-AUTH-009, REQ-AUTH-010, REQ-AUTH-012, REQ-AUTH-013, REQ-AUTH-014, REQ-AUTH-016, REQ-AUTH-017, REQ-AUTH-018, REQ-AUTH-019, REQ-AUTH-022,
// REQ-AUTH-023, REQ-AUTH-024, REQ-AUTH-025
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
    "platform.auth.admin.profile.name=Администратор",
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
      statement.execute("CREATE TABLE player_wallet (account_id UUID NOT NULL REFERENCES platform_account (id) ON DELETE RESTRICT)");
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
  @Autowired
  private Verified verified;

  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    JdbcClient jdbc = JdbcClient.create(source);
    jdbc.sql("DELETE FROM player_wallet").update();
    jdbc.sql("DELETE FROM platform_account WHERE email <> 'admin@site.example'").update();
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    letters.sent.clear();
    letters.changes.clear();
    letters.notices.clear();
    hook.seen.clear();
    hook.failing = false;
    verified.seen.clear();
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
    assertThat(letters.sent.get(0).committed()).as("письмо уходит после фиксации: с другого соединения учётная запись видна").isTrue();
    assertThat(letters.sent.get(0).email()).isEqualTo("new@player.example");
    assertThat(letters.sent.get(0).link().toString()).startsWith("https://site.example/auth/verify?token=");
    assertThat(hook.seen).singleElement().satisfies(seen -> {
      assertThat(seen.account().email()).isEqualTo("new@player.example");
      assertThat(seen.profile().name()).isEqualTo("Игрок");
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
  @DisplayName("Проект закрывает точки аутентификации своим условием: отказ entry-closed, токен CSRF по-прежнему выдаётся")
  void projectClosesTheEntry() throws Exception {
    Browser browser = new Browser();
    browser.send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/register")
        .contentType(MediaType.APPLICATION_JSON).header("X-XSRF-TOKEN", browser.csrf).header("X-Public", "1")
        .content("{\"email\":\"public@player.example\",\"password\":\"" + PASSWORD + "\",\"human\":\"human\"}"))
      .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("entry-closed"));
    browser.send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/login")
        .contentType(MediaType.APPLICATION_JSON).header("X-XSRF-TOKEN", browser.csrf).header("X-Public", "1")
        .content(login("admin@site.example", "initial-admin-password")))
      .andExpect(jsonPath("$.code").value("entry-closed"));
    mvc.perform(get("/api/auth/csrf").header("X-Public", "1")).andExpect(status().isOk());
    assertThat(accounts.findByEmail("public@player.example")).isEmpty();
  }

  @Test
  @DisplayName("Администратор проекта создаёт учётную запись через ядро — с хуком, ролями и правилом пароля — и назначает пароль")
  void administratorCreatesAndSetsPassword() throws Exception {
    Account created = accounts.create(" Made@Player.Example ", PASSWORD, Set.of("USER"), true, Map.of("name", "Клиент"));
    assertThat(created.email()).isEqualTo("made@player.example");
    assertThat(hook.seen).singleElement().satisfies(seen -> assertThat(seen.profile().name()).isEqualTo("Клиент"));
    assertThatThrownBy(() -> accounts.create("weak@player.example", "short", Set.of("USER"), true, Map.of()))
      .isInstanceOf(AuthRefused.class).hasMessageContaining("байт");
    assertThatThrownBy(() -> accounts.create("odd@player.example", PASSWORD, Set.of("OWNER"), true, Map.of()))
      .hasMessageContaining("не объявлена");

    Browser browser = new Browser();
    browser.post("/api/auth/login", login("made@player.example", PASSWORD)).andExpect(status().isOk());
    accounts.setPassword(created.id(), "assigned by admin");
    browser.get("/api/things").andExpect(status().isUnauthorized());
    browser.post("/api/auth/login", login("made@player.example", "assigned by admin")).andExpect(status().isOk());

    accounts.create("made-too@player.example", PASSWORD, Set.of("USER"), false, Map.of());
    assertThat(accounts.search("MADE", 0, 10)).extracting(Account::email).containsExactly("made-too@player.example", "made@player.example");
    assertThat(accounts.search("made", 1, 1)).extracting(Account::email).containsExactly("made@player.example");
    assertThat(accounts.count("made")).isEqualTo(2);
    assertThat(accounts.search("_", 0, 10)).as("подстановочные знаки LIKE ищутся буквально").isEmpty();
  }

  @Test
  @DisplayName("Пользователь меняет свой пароль, назвав текущий: прочие сессии завершаются, текущая остаётся")
  void userChangesOwnPassword() throws Exception {
    registered("own@player.example");
    Browser here = new Browser();
    here.post("/api/auth/login", login("own@player.example", PASSWORD)).andExpect(status().isOk());
    Browser elsewhere = new Browser();
    elsewhere.post("/api/auth/login", login("own@player.example", PASSWORD)).andExpect(status().isOk());

    here.post("/api/auth/password", "{\"current\":\"wrong password here\",\"password\":\"brand new password\"}")
      .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("credentials-rejected"));
    here.post("/api/auth/password", "{\"current\":\"" + PASSWORD + "\",\"password\":\"brand new password\"}")
      .andExpect(status().isNoContent());
    here.get("/api/things").andExpect(status().isOk());
    elsewhere.get("/api/things").andExpect(status().isUnauthorized());
    new Browser().post("/api/auth/login", login("own@player.example", "brand new password")).andExpect(status().isOk());
  }

  @Test
  @DisplayName("После подтверждения почты ядро сообщает событием, и транзакция к этому моменту зафиксирована")
  void verificationIsAnnounced() throws Exception {
    registered("announced@player.example");
    assertThat(verified.seen).singleElement().satisfies(event -> {
      assertThat(event.event().email()).isEqualTo("announced@player.example");
      assertThat(event.committed()).isTrue();
    });
  }

  @Test
  @DisplayName("Первый администратор создаётся тем же путём, что и регистрация: хук получает профиль из настроек")
  void adminGoesThroughTheHook() {
    assertThat(hook.all).anySatisfy(seen -> {
      assertThat(seen.account().email()).isEqualTo("admin@site.example");
      assertThat(seen.profile().name()).isEqualTo("Администратор");
    });
  }

  @Test
  @DisplayName("Очистка стирает по одной записи: удержанная внешним ключом проекта пропускается и считается, остальные стираются")
  void purgeSkipsReferencedAccounts() throws Exception {
    new Browser().post("/api/auth/register", "{\"email\":\"wallet@player.example\",\"password\":\"" + PASSWORD
      + "\",\"human\":\"human\",\"profile\":{\"wallet\":true}}");
    new Browser().post("/api/auth/register", "{\"email\":\"loose@player.example\",\"password\":\"" + PASSWORD + "\",\"human\":\"human\"}");
    clock.advance(Duration.ofDays(8));
    assertThat(accounts.purgeUnverified(Duration.ofDays(7))).isEqualTo(new Purged(1, 1));
    assertThat(accounts.findByEmail("wallet@player.example")).isPresent();
    assertThat(accounts.findByEmail("loose@player.example")).isEmpty();
  }

  @Test
  @DisplayName("Профиль разбирается в класс проекта и проверяется до регистрации: чужое поле и неверное значение — profile-rejected")
  void profileIsTyped() throws Exception {
    Browser browser = new Browser();
    browser.post("/api/auth/register", "{\"email\":\"odd@player.example\",\"password\":\"" + PASSWORD
      + "\",\"human\":\"human\",\"profile\":{\"nickname\":\"x\"}}")
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("profile-rejected"));
    browser.post("/api/auth/register", "{\"email\":\"long@player.example\",\"password\":\"" + PASSWORD
      + "\",\"human\":\"human\",\"profile\":{\"name\":\"" + "я".repeat(41) + "\"}}")
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("profile-rejected"));
    assertThat(hook.seen).isEmpty();
    assertThat(accounts.findByEmail("odd@player.example")).isEmpty();

    Account made = accounts.create("typed@player.example", PASSWORD, Set.of("USER"), true, new TestProfile("Типизированный", null));
    assertThat(made.email()).isEqualTo("typed@player.example");
    assertThat(hook.seen).singleElement().satisfies(seen -> assertThat(seen.profile().name()).isEqualTo("Типизированный"));
    assertThatThrownBy(() -> accounts.create("wrong@player.example", PASSWORD, Set.of("USER"), true, "не профиль"))
      .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("хук ждёт");
  }

  @Test
  @DisplayName("Правило пароля отдаётся клиенту открытой точкой")
  void policyIsOpen() throws Exception {
    mvc.perform(get("/api/auth/policy"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.passwordMinBytes").value(10))
      .andExpect(jsonPath("$.passwordMaxBytes").value(72));
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

  private String changeToken() {
    Matcher found = TOKEN.matcher(letters.changes.get(letters.changes.size() - 1).link().toString());
    assertThat(found.find()).isTrue();
    return found.group(1);
  }

  // REQ-AUTH-023
  @Test
  @DisplayName("Человек меняет свою почту: пароль, письмо на новую, переход по ссылке, извещение прежней, прочие сессии завершены")
  void userChangesOwnEmail() throws Exception {
    registered("before@player.example");
    Browser here = new Browser();
    here.post("/api/auth/login", login("before@player.example", PASSWORD)).andExpect(status().isOk());
    Browser elsewhere = new Browser();
    elsewhere.post("/api/auth/login", login("before@player.example", PASSWORD)).andExpect(status().isOk());
    UUID id = accounts.findByEmail("before@player.example").orElseThrow().id();

    here.post("/api/auth/email", "{\"current\":\"wrong password here\",\"email\":\"after@player.example\"}")
      .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("credentials-rejected"));
    here.post("/api/auth/email", "{\"current\":\"" + PASSWORD + "\",\"email\":\"After@Player.Example\"}")
      .andExpect(status().isAccepted());
    assertThat(letters.changes).singleElement().satisfies(letter -> {
      assertThat(letter.email()).isEqualTo("after@player.example");
      assertThat(letter.link().toString()).startsWith("https://site.example/auth/email?token=");
    });
    assertThat(accounts.find(id).orElseThrow().email()).as("до ссылки почта прежняя").isEqualTo("before@player.example");

    here.post("/api/auth/email/confirm", "{\"token\":\"" + changeToken() + "\"}").andExpect(status().isNoContent());
    assertThat(accounts.find(id).orElseThrow().email()).isEqualTo("after@player.example");
    assertThat(letters.notices).singleElement().satisfies(notice -> {
      assertThat(notice.email()).isEqualTo("before@player.example");
      assertThat(notice.committed()).as("извещение уходит после фиксации").isTrue();
    });
    here.get("/api/things").andExpect(status().isOk());
    elsewhere.get("/api/things").andExpect(status().isUnauthorized());
    new Browser().post("/api/auth/login", login("before@player.example", PASSWORD)).andExpect(status().isUnauthorized());
    new Browser().post("/api/auth/login", login("after@player.example", PASSWORD)).andExpect(status().isOk());
    here.post("/api/auth/email/confirm", "{\"token\":\"" + changeToken() + "\"}")
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("token-rejected"));
  }

  // REQ-AUTH-003, REQ-AUTH-023
  @Test
  @DisplayName("Смена на занятую почту отвечает так же и ничего не шлёт; занятая за время ссылки — email-taken")
  void emailChangeDoesNotReveal() throws Exception {
    registered("first@player.example");
    registered("second@player.example");
    Browser first = new Browser();
    first.post("/api/auth/login", login("first@player.example", PASSWORD)).andExpect(status().isOk());
    first.post("/api/auth/email", "{\"current\":\"" + PASSWORD + "\",\"email\":\"second@player.example\"}")
      .andExpect(status().isAccepted());
    assertThat(letters.changes).isEmpty();
    first.post("/api/auth/email", "{\"current\":\"" + PASSWORD + "\",\"email\":\"free@player.example\"}")
      .andExpect(status().isAccepted());
    accounts.create("free@player.example", PASSWORD, Set.of("USER"), true, Map.of());
    new Browser().post("/api/auth/email/confirm", "{\"token\":\"" + changeToken() + "\"}")
      .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("email-taken"));
    assertThat(accounts.findByEmail("first@player.example")).isPresent();
    assertThat(letters.notices).isEmpty();
  }

  // REQ-AUTH-012, REQ-AUTH-023
  @Test
  @DisplayName("Ссылка смены почты открывается без входа, живёт сутки; запросы смены ограничены частотой")
  void emailChangeLinkIsBounded() throws Exception {
    registered("bounded@player.example");
    Browser owner = new Browser();
    owner.post("/api/auth/login", login("bounded@player.example", PASSWORD)).andExpect(status().isOk());
    owner.post("/api/auth/email", "{\"current\":\"" + PASSWORD + "\",\"email\":\"late@player.example\"}").andExpect(status().isAccepted());
    String late = changeToken();
    owner.post("/api/auth/email", "{\"current\":\"" + PASSWORD + "\",\"email\":\"other@player.example\"}").andExpect(status().isAccepted());
    new Browser().post("/api/auth/email/confirm", "{\"token\":\"" + late + "\"}")
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("token-rejected"));
    String current = changeToken();
    clock.advance(Duration.ofHours(25));
    new Browser().post("/api/auth/email/confirm", "{\"token\":\"" + current + "\"}")
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("token-rejected"));
    for (int index = 0; index < 3; index++) {
      owner.post("/api/auth/email", "{\"current\":\"" + PASSWORD + "\",\"email\":\"next" + index + "@player.example\"}")
        .andExpect(status().isAccepted());
    }
    owner.post("/api/auth/email", "{\"current\":\"" + PASSWORD + "\",\"email\":\"one-more@player.example\"}")
      .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("rate-limited"));
  }

  // REQ-AUTH-023
  @Test
  @DisplayName("Администратор проекта меняет почту сразу: исходы, нормализация, сессии завершены, прежняя почта извещена")
  void adminChangesEmail() throws Exception {
    registered("member@player.example");
    registered("taken@player.example");
    Browser member = new Browser();
    member.post("/api/auth/login", login("member@player.example", PASSWORD)).andExpect(status().isOk());
    UUID id = accounts.findByEmail("member@player.example").orElseThrow().id();

    assertThat(accounts.changeEmail(id, "taken@player.example", Locale.ROOT)).isEqualTo(EmailChange.TAKEN);
    assertThat(accounts.changeEmail(id, "member@player.example", Locale.ROOT)).isEqualTo(EmailChange.SAME);
    assertThat(accounts.changeEmail(UUID.randomUUID(), "nobody@player.example", Locale.ROOT)).isEqualTo(EmailChange.ABSENT);
    assertThatThrownBy(() -> accounts.changeEmail(id, "не почта", Locale.ROOT)).isInstanceOf(AuthRefused.class);
    member.get("/api/things").andExpect(status().isOk());
    assertThat(letters.notices).isEmpty();

    assertThat(accounts.changeEmail(id, " Renamed@Player.Example ", Locale.forLanguageTag("ru"))).isEqualTo(EmailChange.CHANGED);
    assertThat(accounts.find(id).orElseThrow().email()).isEqualTo("renamed@player.example");
    member.get("/api/things").andExpect(status().isUnauthorized());
    assertThat(letters.notices).singleElement().satisfies(notice -> {
      assertThat(notice.email()).isEqualTo("member@player.example");
      assertThat(notice.committed()).isTrue();
      assertThat(notice.locale()).isEqualTo(Locale.forLanguageTag("ru"));
    });
  }

  // REQ-AUTH-025
  @Test
  @DisplayName("Учётные записи с ролью: только незаблокированные, необъявленная роль — отказ")
  void accountsWithRole() throws Exception {
    Account first = accounts.create("first-admin@player.example", PASSWORD, Set.of("USER", "ADMIN"), true, Map.of());
    Account blocked = accounts.create("blocked-admin@player.example", PASSWORD, Set.of("ADMIN"), true, Map.of());
    accounts.create("user@player.example", PASSWORD, Set.of("USER"), true, Map.of());
    accounts.block(blocked.id());
    UUID admin = accounts.findByEmail("admin@site.example").orElseThrow().id();
    assertThat(accounts.withRole("ADMIN")).containsExactlyInAnyOrder(admin, first.id());
    assertThatThrownBy(() -> accounts.withRole("SUPPORT")).isInstanceOf(IllegalArgumentException.class);
  }

  // REQ-AUTH-024
  @Test
  @DisplayName("Удаление учётной записи: REMOVED стирает роли и сессии, HELD — при внешнем ключе проекта, ABSENT — если записи нет")
  void accountIsDeleted() throws Exception {
    registered("gone@player.example");
    Browser gone = new Browser();
    gone.post("/api/auth/login", login("gone@player.example", PASSWORD)).andExpect(status().isOk());
    UUID id = accounts.findByEmail("gone@player.example").orElseThrow().id();
    Account held = accounts.create("held@player.example", PASSWORD, Set.of("USER"), true, Map.of("wallet", true));

    assertThat(accounts.delete(held.id())).isEqualTo(Removal.HELD);
    assertThat(accounts.find(held.id())).isPresent();
    assertThat(accounts.delete(id)).isEqualTo(Removal.REMOVED);
    assertThat(accounts.find(id)).isEmpty();
    assertThat(JdbcClient.create(source).sql("SELECT COUNT(*) FROM platform_account_role WHERE account_id = :id").param("id", id)
      .query(Long.class).single()).isZero();
    gone.get("/api/things").andExpect(status().isUnauthorized());
    assertThat(accounts.delete(id)).isEqualTo(Removal.ABSENT);
  }

  // REQ-AUTH-022
  @Test
  @DisplayName("Открытая точка модуля ядра открыта раньше правил проекта, прочие пути модуля — по правилам проекта")
  void moduleRulesPrecedeTheProject() throws Exception {
    mvc.perform(get("/api/module/open")).andExpect(status().isOk());
    mvc.perform(get("/api/module/other")).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("authentication-required"));
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
    assertThat(accounts.purgeUnverified(Duration.ofDays(7))).isEqualTo(new Purged(1, 0));
    assertThat(accounts.findByEmail("idle@player.example")).isEmpty();
    assertThat(accounts.findByEmail("active@player.example")).isPresent();
  }

  record Letter(String email, URI link, Locale locale, boolean committed) {
  }

  static final class Letters implements AuthLetters {

    final List<Letter> sent = new CopyOnWriteArrayList<>();
    final List<Letter> changes = new CopyOnWriteArrayList<>();
    final List<Letter> notices = new CopyOnWriteArrayList<>();
    private final DataSource source;

    Letters(DataSource source) {
      this.source = source;
    }

    @Override
    public void verification(String email, URI link, Locale locale) {
      sent.add(new Letter(email, link, locale, visible(email)));
    }

    @Override
    public void passwordReset(String email, URI link, Locale locale) {
      sent.add(new Letter(email, link, locale, visible(email)));
    }

    // REQ-AUTH-023
    @Override
    public void emailChange(String email, URI link, Locale locale) {
      changes.add(new Letter(email, link, locale, !visible(email)));
    }

    // REQ-AUTH-023
    @Override
    public void emailChanged(String previousEmail, Locale locale) {
      notices.add(new Letter(previousEmail, null, locale, !visible(previousEmail)));
    }

    // REQ-AUTH-010
    private boolean visible(String email) {
      try (var connection = source.getConnection();
        var query = connection.prepareStatement("SELECT COUNT(*) FROM platform_account WHERE email = ?")) {
        query.setString(1, email);
        try (var rows = query.executeQuery()) {
          return rows.next() && rows.getInt(1) == 1;
        }
      } catch (java.sql.SQLException failure) {
        throw new IllegalStateException(failure);
      }
    }
  }

  record Seen(Account account, TestProfile profile) {
  }

  // REQ-AUTH-021
  record TestProfile(@jakarta.validation.constraints.Size(max = 40) String name, Boolean wallet) {
  }

  static final class Hook implements RegistrationHook<TestProfile> {

    final List<Seen> seen = new CopyOnWriteArrayList<>();
    final List<Seen> all = new CopyOnWriteArrayList<>();
    volatile boolean failing;
    private final DataSource source;

    Hook(DataSource source) {
      this.source = source;
    }

    @Override
    public Class<TestProfile> profile() {
      return TestProfile.class;
    }

    @Override
    public void registered(Account account, TestProfile profile) {
      if (failing) {
        throw new IllegalStateException("профиль проекта не создан");
      }
      if (Boolean.TRUE.equals(profile.wallet())) {
        JdbcClient.create(source).sql("INSERT INTO player_wallet (account_id) VALUES (:id)").param("id", account.id()).update();
      }
      seen.add(new Seen(account, profile));
      all.add(new Seen(account, profile));
    }
  }

  record Event(AccountVerified event, boolean committed) {
  }

  static final class Verified {

    final List<Event> seen = new CopyOnWriteArrayList<>();
    private final DataSource source;

    Verified(DataSource source) {
      this.source = source;
    }

    // REQ-AUTH-017
    @EventListener
    void on(AccountVerified event) {
      try (var connection = source.getConnection();
        var query = connection.prepareStatement("SELECT email_verified FROM platform_account WHERE id = ?")) {
        query.setObject(1, event.id());
        try (var rows = query.executeQuery()) {
          seen.add(new Event(event, rows.next() && rows.getBoolean(1)));
        }
      } catch (java.sql.SQLException failure) {
        throw new IllegalStateException(failure);
      }
    }
  }

  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration
  static class Service {

    @Bean
    Letters letters(DataSource source) {
      return new Letters(source);
    }

    @Bean
    Hook hook(DataSource source) {
      return new Hook(source);
    }

    @Bean
    Verified verified(DataSource source) {
      return new Verified(source);
    }

    @Bean
    EntryAccess entryAccess() {
      return request -> request.getHeader("X-Public") == null;
    }

    @Bean
    HumanCheck humanCheck() {
      return (answer, action, address) -> "human".equals(answer);
    }

    @Bean
    ApiAccess apiAccess() {
      return rules -> rules.requestMatchers("/api/admin/**", "/api/module/**").hasRole("ADMIN");
    }

    // REQ-AUTH-022
    @Bean
    ModuleApiAccess moduleAccess() {
      return rules -> rules.requestMatchers(HttpMethod.GET, "/api/module/open").permitAll();
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

    @GetMapping({"/api/module/open", "/api/module/other"})
    String module() {
      return "модуль";
    }

    @GetMapping("/api/admin/panel")
    String panel() {
      return "панель";
    }
  }

}
