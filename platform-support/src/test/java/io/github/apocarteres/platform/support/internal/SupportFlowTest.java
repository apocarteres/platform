package io.github.apocarteres.platform.support.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.ApiAccess;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.EntryAccess;
import io.github.apocarteres.platform.auth.HumanCheck;
import io.github.apocarteres.platform.auth.RegistrationHook;
import io.github.apocarteres.platform.support.AnswerNotice;
import io.github.apocarteres.platform.support.ArrivalNotice;
import io.github.apocarteres.platform.support.Expired;
import io.github.apocarteres.platform.support.GuestIntake;
import io.github.apocarteres.platform.support.SupportLetters;
import io.github.apocarteres.platform.support.SupportRetention;
import io.github.apocarteres.platform.time.MutableClock;
import jakarta.servlet.Filter;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
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
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-SUPPORT-001, REQ-SUPPORT-002, REQ-SUPPORT-003, REQ-SUPPORT-004, REQ-SUPPORT-005, REQ-SUPPORT-006, REQ-SUPPORT-007,
// REQ-SUPPORT-008, REQ-SUPPORT-009, REQ-SUPPORT-010, REQ-SUPPORT-011, REQ-SUPPORT-012
@SpringBootTest(
  classes = SupportFlowTest.Service.class,
  properties = {
    "platform.auth.roles=USER,ADMIN",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
    "platform.support.operator-role=ADMIN",
    "spring.servlet.multipart.max-file-size=5MB",
    "spring.servlet.multipart.max-request-size=16MB",
  }
)
class SupportFlowTest {

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
      for (String table : List.of("platform-auth/create-account", "platform-auth/create-role", "platform-auth/create-token",
        "platform-support/create-request", "platform-support/create-entry", "platform-support/create-attachment",
        "platform-support/create-attachment-content", "platform-support/create-answer-link",
        "platform-notifications/create-notification")) {
        try (var input = SupportFlowTest.class.getResourceAsStream("/sql/" + table + ".sql")) {
          statement.execute(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
      }
    } catch (java.sql.SQLException | java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
  }

  static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 1, 2, 3};
  static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x10, 4};
  static final byte[] GIF = {'G', 'I', 'F', '8', '9', 'a', 0};
  static final String PASSWORD = "correct horse battery";
  static final Pattern TOKEN = Pattern.compile("token=([A-Za-z0-9_-]+)");

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
  private MutableClock clock;
  @Autowired
  private Accounts accounts;
  @Autowired
  private StringRedisTemplate redis;
  @Autowired
  private DataSource source;
  @Autowired
  private SupportRetention retention;

  private final JsonMapper json = JsonMapper.builder().build();
  private MockMvc mvc;
  private JdbcClient jdbc;

  @BeforeEach
  void setUp() {
    jdbc = JdbcClient.create(source);
    jdbc.sql("DELETE FROM platform_support_attachment_content").update();
    jdbc.sql("DELETE FROM platform_support_request").update();
    jdbc.sql("DELETE FROM platform_account").update();
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    letters.answers.clear();
    letters.arrivals.clear();
    letters.failing = false;
    clock.set(java.time.Instant.parse("2026-09-25T10:00:00Z"));
    Filter guard = context.getBean("supportIntakeGuard", FilterRegistrationBean.class).getFilter();
    mvc = MockMvcBuilders.webAppContextSetup(context)
      .addFilters(guard, context.getBean("springSessionRepositoryFilter", Filter.class),
        context.getBean("springSecurityFilterChain", Filter.class))
      .build();
  }

  final class Tab {

    private final List<Cookie> cookies = new ArrayList<>();
    private final String address;
    private String csrf;

    Tab() throws Exception {
      this("198.51.100.7");
    }

    Tab(String address) throws Exception {
      this.address = address;
      MockHttpServletResponse response = send(MockMvcRequestBuilders.get("/api/auth/csrf")).andExpect(status().isOk())
        .andReturn().getResponse();
      csrf = response.getContentAsString().replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    Tab signIn(String email) throws Exception {
      post("/api/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}").andExpect(status().isOk());
      MockHttpServletResponse response = get("/api/auth/csrf").andReturn().getResponse();
      csrf = response.getContentAsString().replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
      return this;
    }

    ResultActions post(String path, String body) throws Exception {
      return send(MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON).content(body).header("X-XSRF-TOKEN", csrf));
    }

    ResultActions get(String path) throws Exception {
      return send(MockMvcRequestBuilders.get(path));
    }

    ResultActions submit(String request, byte[]... files) throws Exception {
      MockMultipartHttpServletRequestBuilder builder = multipart("/api/support/requests");
      builder.file(new MockMultipartFile("request", "", MediaType.APPLICATION_JSON_VALUE, request.getBytes(StandardCharsets.UTF_8)));
      int index = 0;
      for (byte[] file : files) {
        builder.file(new MockMultipartFile("files", "снимок-" + index++ + ".png", "image/png", file));
      }
      builder.header("X-XSRF-TOKEN", csrf);
      int length = request.length() + Arrays.stream(files).mapToInt(file -> file.length).sum() + 512;
      return send(builder.with(r -> {
        r.setContent(new byte[length]);
        return r;
      }));
    }

    ResultActions send(AbstractMockHttpServletRequestBuilder<?> request) throws Exception {
      if (!cookies.isEmpty()) {
        request.cookie(cookies.toArray(Cookie[]::new));
      }
      ResultActions result = mvc.perform(request.locale(Locale.forLanguageTag("ru-RU")).with(r -> {
        r.setRemoteAddr(address);
        return r;
      }));
      for (Cookie cookie : result.andReturn().getResponse().getCookies()) {
        cookies.removeIf(kept -> kept.getName().equals(cookie.getName()));
        if (cookie.getMaxAge() != 0) {
          cookies.add(cookie);
        }
      }
      return result;
    }
  }

  private UUID account(String email, String... roles) {
    return accounts.create(email, PASSWORD, Set.of(roles), true, null).id();
  }

  private JsonNode body(ResultActions result) throws Exception {
    return json.readTree(result.andReturn().getResponse().getContentAsString());
  }

  private static String request(String message) {
    return "{\"message\":\"" + message + "\"}";
  }

  private static String guest(String message, String email) {
    return "{\"message\":\"" + message + "\",\"email\":\"" + email + "\"}";
  }

  private String submitted(Tab browser, String request, byte[]... files) throws Exception {
    return body(browser.submit(request, files).andExpect(status().isCreated())).get("id").asString();
  }

  @Test
  @DisplayName("Вошедший отправляет обращение: номер, своё в списке, ход; оператор извещён после фиксации")
  void signedInSubmits() throws Exception {
    account("player@site.example", "USER");
    Tab player = new Tab().signIn("player@site.example");
    JsonNode created = body(player.submit(request("Не открывается страница")).andExpect(status().isCreated()));
    String id = created.get("id").asString();
    assertThat(created.get("number").asLong()).isPositive();
    player.get("/api/support/requests").andExpect(status().isOk())
      .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].id").value(id))
      .andExpect(jsonPath("$.items[0].state").value("NEW"));
    player.get("/api/support/requests/" + id).andExpect(status().isOk())
      .andExpect(jsonPath("$.message").value("Не открывается страница"));
    assertThat(letters.arrivals).singleElement().satisfies(arrival -> {
      assertThat(arrival.notice().first()).isTrue();
      assertThat(arrival.notice().link()).isEqualTo(URI.create("https://site.example/support/operator/requests/" + id));
      assertThat(arrival.committed()).isTrue();
    });
  }

  // REQ-SUPPORT-002
  @Test
  @DisplayName("Приём без входа проект объявляет явно: открыт — почта обязательна, закрыт — guest-intake-closed")
  void guestIntakeIsDeclared() throws Exception {
    Tab guest = new Tab();
    guest.submit(request("без почты")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("guest-email-rejected"));
    guest.submit(guest("с почтой", "Guest@Mail.Example")).andExpect(status().isCreated());
    assertThat(jdbc.sql("SELECT guest_email FROM platform_support_request").query(String.class).single()).isEqualTo("guest@mail.example");
    guest.get("/api/support/policy").andExpect(jsonPath("$.guestIntake").value(true));
    guest.send(multipart("/api/support/requests")
        .file(new MockMultipartFile("request", "", MediaType.APPLICATION_JSON_VALUE, guest("закрыто", "g@mail.example").getBytes(StandardCharsets.UTF_8)))
        .header("X-XSRF-TOKEN", guest.csrf).header("X-Guest-Closed", "1").with(r -> {
          r.setContent(new byte[100]);
          return r;
        }))
      .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("guest-intake-closed"));
    guest.send(MockMvcRequestBuilders.get("/api/support/policy").header("X-Guest-Closed", "1"))
      .andExpect(jsonPath("$.guestIntake").value(false));
    guest.get("/api/support/requests").andExpect(status().isUnauthorized());
  }

  // REQ-SUPPORT-003
  @Test
  @DisplayName("Предел тела и ограничитель по сети срабатывают до разбора и до проверки CSRF")
  void intakeIsGuardedBeforeParsing() throws Exception {
    Tab guest = new Tab();
    guest.send(multipart("/api/support/requests").with(r -> {
      r.setContent(new byte[(int) SupportLimits.BODY_BYTES + 1]);
      return r;
    })).andExpect(status().isContentTooLarge()).andExpect(jsonPath("$.code").value("body-too-large"));
    guest.send(multipart("/api/support/requests").with(r -> {
      r.setContent(null);
      return r;
    })).andExpect(status().isLengthRequired()).andExpect(jsonPath("$.code").value("length-required"));
    for (int index = 0; index < 10; index++) {
      guest.submit(guest("обращение " + index, "g" + index + "@mail.example")).andExpect(status().isCreated());
    }
    guest.send(multipart("/api/support/requests").with(r -> {
      r.setContent(new byte[10]);
      return r;
    })).andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("rate-limited"))
      .andExpect(header().exists("Retry-After"));
  }

  // REQ-SUPPORT-003
  @Test
  @DisplayName("Невошедший с одной почты — не больше трёх обращений в час")
  void guestIsLimitedByEmail() throws Exception {
    for (int index = 0; index < 3; index++) {
      new Tab("203.0.113." + index).submit(guest("обращение", "same@mail.example")).andExpect(status().isCreated());
    }
    new Tab("203.0.113.9").submit(guest("обращение", "same@mail.example"))
      .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("rate-limited"));
  }

  // REQ-SUPPORT-003
  @Test
  @DisplayName("Общий предел multipart ниже нужного центру — служба не стартует и называет настройку")
  void multipartRoomIsRequired() {
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> SupportAutoConfiguration.requireRoom(
        new jakarta.servlet.MultipartConfigElement("", 1024 * 1024, 16L * 1024 * 1024, 0)))
      .hasMessageContaining("spring.servlet.multipart.max-file-size");
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> SupportAutoConfiguration.requireRoom(
        new jakarta.servlet.MultipartConfigElement("", 5L * 1024 * 1024, 10L * 1024 * 1024, 0)))
      .hasMessageContaining("spring.servlet.multipart.max-request-size");
    SupportAutoConfiguration.requireRoom(new jakarta.servlet.MultipartConfigElement("", -1, -1, 0));
    org.springframework.beans.factory.support.DefaultListableBeanFactory beans = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
    beans.registerSingleton("multipart", new jakarta.servlet.MultipartConfigElement("", 1024 * 1024, 16L * 1024 * 1024, 0));
    org.springframework.mock.env.MockEnvironment environment = new org.springframework.mock.env.MockEnvironment()
      .withProperty("platform.support.operator-role", "ADMIN").withProperty("platform.auth.roles", "USER,ADMIN")
      .withProperty("platform.auth.link-base", "https://site.example");
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> new SupportAutoConfiguration().supportSettings(environment,
        beans.getBeanProvider(jakarta.servlet.MultipartConfigElement.class)))
      .hasMessageContaining("spring.servlet.multipart.max-file-size");
  }

  // REQ-SUPPORT-004, REQ-SUPPORT-009
  @Test
  @DisplayName("Невошедшему ответ приходит ссылкой без текста; ссылка открывает ответ на чтение и истекает")
  void guestReadsTheAnswerByLink() throws Exception {
    account("operator@site.example", "USER", "ADMIN");
    String id = submitted(new Tab(), guest("Не могу войти", "guest@mail.example"));
    Tab operator = new Tab().signIn("operator@site.example");
    operator.post("/api/support/operator/requests/" + id + "/messages", "{\"text\":\"Сбросьте пароль\"}").andExpect(status().isOk());
    AnswerNotice letter = letters.answers.getFirst();
    assertThat(letter.email()).isEqualTo("guest@mail.example");
    assertThat(letter.text()).isEmpty();
    assertThat(letter.locale()).isEqualTo(Locale.forLanguageTag("ru-RU"));
    Matcher token = TOKEN.matcher(letter.link().toString());
    assertThat(token.find()).isTrue();
    assertThat(jdbc.sql("SELECT COUNT(*) FROM platform_support_answer_link WHERE digest = :d").param("d", token.group(1))
      .query(Long.class).single()).isZero();
    Tab guest = new Tab("192.0.2.4");
    guest.post("/api/support/answer", "{\"token\":\"" + token.group(1) + "\"}").andExpect(status().isOk())
      .andExpect(jsonPath("$.steps[0].text").value("Сбросьте пароль")).andExpect(jsonPath("$.email").doesNotExist());
    clock.advance(Duration.ofDays(8));
    guest.post("/api/support/answer", "{\"token\":\"" + token.group(1) + "\"}").andExpect(status().isBadRequest())
      .andExpect(jsonPath("$.code").value("answer-link-rejected"));
    guest.post("/api/support/answer", "{\"token\":\"forged\"}").andExpect(jsonPath("$.code").value("answer-link-rejected"));
  }

  // REQ-SUPPORT-009
  @Test
  @DisplayName("Автору с учётной записью ответ приходит с текстом и ссылкой на обращение")
  void accountAuthorGetsTheText() throws Exception {
    account("player@site.example", "USER");
    account("operator@site.example", "USER", "ADMIN");
    String id = submitted(new Tab().signIn("player@site.example"), request("Вопрос"));
    new Tab().signIn("operator@site.example")
      .post("/api/support/operator/requests/" + id + "/messages", "{\"text\":\"Ответ\"}").andExpect(status().isOk());
    assertThat(letters.answers).singleElement().satisfies(letter -> {
      assertThat(letter.email()).isEqualTo("player@site.example");
      assertThat(letter.text()).contains("Ответ");
      assertThat(letter.link()).isEqualTo(URI.create("https://site.example/support/requests/" + id));
    });
  }

  // REQ-SUPPORT-005
  @Test
  @DisplayName("Вложения: PNG и JPEG по содержимому, не больше трёх и не больше 5 МБ; отдаются автору и оператору")
  void attachmentsAreImages() throws Exception {
    account("player@site.example", "USER");
    account("other@site.example", "USER");
    account("operator@site.example", "USER", "ADMIN");
    Tab player = new Tab().signIn("player@site.example");
    player.submit(request("гиф"), GIF).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("attachment-rejected"));
    player.submit(request("четыре"), PNG, PNG, PNG, PNG).andExpect(jsonPath("$.code").value("attachment-rejected"));
    byte[] large = new byte[SupportLimits.ATTACHMENT_BYTES + 1];
    System.arraycopy(PNG, 0, large, 0, PNG.length);
    player.submit(request("большой"), large).andExpect(jsonPath("$.code").value("attachment-rejected"));
    String id = submitted(player, request("два снимка"), PNG, JPEG);
    JsonNode files = body(player.get("/api/support/requests/" + id)).get("files");
    assertThat(files).hasSize(2);
    assertThat(files.get(1).get("type").asString()).isEqualTo("image/jpeg");
    String file = files.get(0).get("id").asString();
    byte[] got = player.get("/api/support/requests/" + id + "/files/" + file).andExpect(status().isOk())
      .andExpect(header().string("X-Content-Type-Options", "nosniff")).andReturn().getResponse().getContentAsByteArray();
    assertThat(got).isEqualTo(PNG);
    new Tab().signIn("operator@site.example").get("/api/support/operator/requests/" + id + "/files/" + file)
      .andExpect(status().isOk());
    new Tab().signIn("other@site.example").get("/api/support/requests/" + id + "/files/" + file)
      .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("request-not-found"));
  }

  // REQ-SUPPORT-006
  @Test
  @DisplayName("Снимок и журнал: адрес без строки запроса, журнал маскируется ещё раз и ограничен, видит только оператор")
  void snapshotAndJournalAreScrubbed() throws Exception {
    account("player@site.example", "USER");
    account("operator@site.example", "USER", "ADMIN");
    StringBuilder journal = new StringBuilder("[");
    for (int index = 0; index < 5100; index++) {
      journal.append(index == 0 ? "" : ",").append("{\"at\":\"2026-09-25T09:00:00Z\",\"kind\":\"request\",\"method\":\"GET\",")
        .append("\"path\":\"/api/items/").append(index).append("?token=abc\",\"status\":200}");
    }
    journal.append(",{\"at\":\"x\",\"kind\":\"other\"},{\"at\":\"2026-09-25T09:00:00Z\",\"kind\":\"error\",")
      .append("\"message\":\"письмо ivan@mail.example не ушло\"}]");
    String body = "{\"message\":\"с журналом\",\"snapshot\":{\"version\":\"1.2\",\"page\":\"https://site.example/reset?token=Zk3p_Qe9-Lm2Xc7Vb4Nq#x\","
      + "\"language\":\"ru\",\"width\":1280,\"height\":800,\"agent\":\"Tab\"},\"journal\":" + journal + "}";
    String id = submitted(new Tab().signIn("player@site.example"), body);
    JsonNode view = body(new Tab().signIn("operator@site.example").get("/api/support/operator/requests/" + id));
    assertThat(view.get("snapshot").get("page").asString()).isEqualTo("/reset");
    JsonNode kept = view.get("journal");
    assertThat(kept.size()).isLessThanOrEqualTo(SupportLimits.JOURNAL_ENTRIES);
    assertThat(kept.get(kept.size() - 1).get("message").asString()).isEqualTo("письмо *** не ушло");
    assertThat(kept.get(0).get("path").asString()).doesNotContain("?");
    assertThat(jdbc.sql("SELECT OCTET_LENGTH(journal) FROM platform_support_request").query(Integer.class).single())
      .isLessThanOrEqualTo(SupportLimits.JOURNAL_BYTES);
    new Tab().signIn("player@site.example").get("/api/support/requests/" + id).andExpect(status().isOk())
      .andExpect(jsonPath("$.journal").doesNotExist()).andExpect(jsonPath("$.snapshot").doesNotExist())
      .andExpect(jsonPath("$.email").doesNotExist());
  }

  // REQ-SUPPORT-006
  @Test
  @DisplayName("Журнал держит не больше 5000 записей — самые свежие, даже когда объём в пределе")
  void journalKeepsTheLatestEntries() throws Exception {
    account("player@site.example", "USER");
    account("operator@site.example", "USER", "ADMIN");
    StringBuilder journal = new StringBuilder("[");
    for (int index = 0; index < 5100; index++) {
      journal.append(index == 0 ? "" : ",").append("{\"at\":\"").append(index).append("\",\"kind\":\"navigation\"}");
    }
    journal.append("]");
    String id = submitted(new Tab().signIn("player@site.example"), "{\"message\":\"много\",\"journal\":" + journal + "}");
    JsonNode kept = body(new Tab().signIn("operator@site.example").get("/api/support/operator/requests/" + id)).get("journal");
    assertThat(kept.size()).isEqualTo(SupportLimits.JOURNAL_ENTRIES);
    assertThat(kept.get(0).get("at").asString()).isEqualTo("100");
    assertThat(kept.get(kept.size() - 1).get("at").asString()).isEqualTo("5099");
  }

  // REQ-SUPPORT-007
  @Test
  @DisplayName("Состояния: ответ оператора — ANSWERED, сообщение автора — IN_PROGRESS, закрытое не пишется, запрещённый переход отказывает")
  void statesMoveByTheRules() throws Exception {
    account("player@site.example", "USER");
    account("operator@site.example", "USER", "ADMIN");
    Tab player = new Tab().signIn("player@site.example");
    Tab operator = new Tab().signIn("operator@site.example");
    String id = submitted(player, request("вопрос"));
    operator.post("/api/support/operator/requests/" + id + "/state", "{\"state\":\"ANSWERED\"}")
      .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("transition-refused"));
    operator.post("/api/support/operator/requests/" + id + "/messages", "{\"text\":\"ответ\"}").andExpect(jsonPath("$.state").value("ANSWERED"));
    player.post("/api/support/requests/" + id + "/messages", "{\"text\":\"не помогло\"}").andExpect(jsonPath("$.state").value("IN_PROGRESS"));
    operator.post("/api/support/operator/requests/" + id + "/state", "{\"state\":\"CLOSED\"}").andExpect(jsonPath("$.state").value("CLOSED"))
      .andExpect(jsonPath("$.closedAt").exists());
    player.post("/api/support/requests/" + id + "/messages", "{\"text\":\"ещё\"}")
      .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("request-closed"));
    operator.post("/api/support/operator/requests/" + id + "/messages", "{\"text\":\"ещё\"}").andExpect(jsonPath("$.code").value("request-closed"));
    operator.post("/api/support/operator/requests/" + id + "/state", "{\"state\":\"IN_PROGRESS\"}")
      .andExpect(jsonPath("$.state").value("IN_PROGRESS")).andExpect(jsonPath("$.closedAt").doesNotExist());
    player.post("/api/support/requests/" + id + "/messages", "{\"text\":\"   \"}").andExpect(jsonPath("$.code").value("message-rejected"));
    JsonNode steps = body(operator.get("/api/support/operator/requests/" + id)).get("steps");
    List<String> moves = new ArrayList<>();
    steps.forEach(step -> {
      if ("STATE".equals(step.get("kind").asString())) {
        moves.add(step.get("from").asString() + ">" + step.get("to").asString() + ":" + step.get("side").asString());
      }
    });
    assertThat(moves).containsExactly("NEW>ANSWERED:OPERATOR", "ANSWERED>IN_PROGRESS:AUTHOR", "IN_PROGRESS>CLOSED:OPERATOR",
      "CLOSED>IN_PROGRESS:OPERATOR");
  }

  // REQ-SUPPORT-008
  @Test
  @DisplayName("Новое: для оператора — непросмотренное и дописанное автором, для автора — действие поддержки после просмотра")
  void freshIsCountedForBothSides() throws Exception {
    account("player@site.example", "USER");
    account("operator@site.example", "USER", "ADMIN");
    Tab player = new Tab().signIn("player@site.example");
    Tab operator = new Tab().signIn("operator@site.example");
    String id = submitted(player, request("вопрос"));
    operator.get("/api/support/unread").andExpect(jsonPath("$.operator").value(1));
    player.get("/api/support/unread").andExpect(jsonPath("$.mine").value(0)).andExpect(jsonPath("$.operator").doesNotExist());
    operator.get("/api/support/operator/requests/" + id).andExpect(status().isOk());
    operator.get("/api/support/unread").andExpect(jsonPath("$.operator").value(1));
    operator.post("/api/support/operator/requests/" + id + "/seen", "{}").andExpect(status().isNoContent());
    operator.get("/api/support/unread").andExpect(jsonPath("$.operator").value(0));
    clock.advance(Duration.ofMinutes(1));
    operator.post("/api/support/operator/requests/" + id + "/messages", "{\"text\":\"ответ\"}").andExpect(status().isOk());
    player.get("/api/support/unread").andExpect(jsonPath("$.mine").value(1));
    player.get("/api/support/requests").andExpect(jsonPath("$.items[0].fresh").value(true));
    player.post("/api/support/requests/" + id + "/seen", "{}").andExpect(status().isNoContent());
    player.get("/api/support/unread").andExpect(jsonPath("$.mine").value(0));
    clock.advance(Duration.ofMinutes(1));
    player.post("/api/support/requests/" + id + "/messages", "{\"text\":\"спасибо\"}").andExpect(status().isOk());
    operator.get("/api/support/unread").andExpect(jsonPath("$.operator").value(1));
  }

  // REQ-SUPPORT-009
  @Test
  @DisplayName("Отказ письма не откатывает ответ: запись в ходе остаётся, ответ точки успешен")
  void failedLetterKeepsTheAnswer() throws Exception {
    account("operator@site.example", "USER", "ADMIN");
    String id = submitted(new Tab(), guest("вопрос", "guest@mail.example"));
    letters.failing = true;
    new Tab().signIn("operator@site.example")
      .post("/api/support/operator/requests/" + id + "/messages", "{\"text\":\"ответ\"}").andExpect(status().isOk());
    assertThat(jdbc.sql("SELECT COUNT(*) FROM platform_support_entry WHERE kind = 'MESSAGE'").query(Long.class).single()).isEqualTo(1);
  }

  // REQ-SUPPORT-009
  @Test
  @DisplayName("Откат приёма — письма нет")
  void rolledBackIntakeSendsNothing() throws Exception {
    account("player@site.example", "USER");
    jdbc.sql("ALTER TABLE platform_support_attachment ADD CONSTRAINT refuse_all CHECK (size_bytes < 0)").update();
    try {
      new Tab().signIn("player@site.example").submit(request("с вложением"), PNG).andExpect(status().is5xxServerError());
    } finally {
      jdbc.sql("ALTER TABLE platform_support_attachment DROP CONSTRAINT refuse_all").update();
    }
    assertThat(letters.arrivals).isEmpty();
    assertThat(jdbc.sql("SELECT COUNT(*) FROM platform_support_request").query(Long.class).single()).isZero();
  }

  // REQ-SUPPORT-010
  @Test
  @DisplayName("Стирание по сроку: вложения, журнал и почта невошедшего через год после закрытия; повторный прогон ничего не меняет")
  void expiredDataIsPurged() throws Exception {
    account("operator@site.example", "USER", "ADMIN");
    String closed = submitted(new Tab("192.0.2.1"), "{\"message\":\"старое\",\"email\":\"old@mail.example\",\"journal\":["
      + "{\"at\":\"2026-09-25T09:00:00Z\",\"kind\":\"navigation\",\"path\":\"/a\"}]}", PNG);
    String open = submitted(new Tab("192.0.2.2"), guest("открытое", "open@mail.example"), PNG);
    Tab operator = new Tab().signIn("operator@site.example");
    operator.post("/api/support/operator/requests/" + closed + "/state", "{\"state\":\"CLOSED\"}").andExpect(status().isOk());
    clock.advance(Duration.ofDays(364));
    assertThat(retention.purgeExpired()).isEqualTo(new Expired(0, 0, 0));
    clock.advance(Duration.ofDays(2));
    assertThat(retention.purgeExpired()).isEqualTo(new Expired(1, 1, 1));
    assertThat(retention.purgeExpired()).isEqualTo(new Expired(0, 0, 0));
    JsonNode view = body(operator.get("/api/support/operator/requests/" + closed));
    assertThat(view.get("journal").isNull()).isTrue();
    assertThat(view.get("snapshot").isNull()).isTrue();
    assertThat(view.get("email").isNull()).isTrue();
    assertThat(view.get("files").get(0).get("purged").asBoolean()).isTrue();
    assertThat(view.get("attachmentsExpired").asBoolean()).isTrue();
    assertThat(view.get("message").asString()).isEqualTo("старое");
    assertThat(jdbc.sql("SELECT COUNT(*) FROM platform_support_attachment_content").query(Long.class).single()).isEqualTo(1);
    assertThat(body(operator.get("/api/support/operator/requests/" + open)).get("files").get(0).get("purged").asBoolean()).isFalse();
  }

  // REQ-SUPPORT-010
  @Test
  @DisplayName("Срок хранения не бывает бессрочным: нулевой срок — служба не стартует и называет настройку")
  void retentionIsFinite() {
    org.springframework.mock.env.MockEnvironment environment = new org.springframework.mock.env.MockEnvironment()
      .withProperty("platform.support.operator-role", "ADMIN").withProperty("platform.auth.roles", "USER,ADMIN")
      .withProperty("platform.auth.link-base", "https://site.example").withProperty("platform.support.retention.journal", "0s");
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> SupportSettings.of(environment))
      .hasMessageContaining("platform.support.retention.journal");
    environment.setProperty("platform.support.retention.journal", "30d");
    assertThat(SupportSettings.of(environment).journalKept()).isEqualTo(Duration.ofDays(30));
    environment.setProperty("platform.support.operator-role", "SUPPORT");
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> SupportSettings.of(environment))
      .hasMessageContaining("platform.support.operator-role");
  }

  // REQ-SUPPORT-011
  @Test
  @DisplayName("Удаление по запросу субъекта: тексты, вложения, журнал и почта стёрты, автор обращения не видит, оператору — остов")
  void subjectIsErased() throws Exception {
    UUID player = account("player@site.example", "USER");
    account("operator@site.example", "USER", "ADMIN");
    Tab author = new Tab().signIn("player@site.example");
    String mine = submitted(author, request("моё"), PNG);
    String guest = submitted(new Tab("192.0.2.3"), guest("гостевое", "Guest@Mail.Example"), PNG);
    Tab operator = new Tab().signIn("operator@site.example");
    operator.post("/api/support/operator/requests/" + mine + "/messages", "{\"text\":\"ответ с данными\"}").andExpect(status().isOk());
    // REQ-AUTH-024
    assertThat(accounts.delete(player)).isEqualTo(io.github.apocarteres.platform.auth.Removal.HELD);
    assertThat(retention.erase(player)).isEqualTo(1);
    assertThat(retention.erase(player)).isZero();
    assertThat(retention.erase("guest@mail.example")).isEqualTo(1);
    author.get("/api/support/requests/" + mine).andExpect(status().isNotFound());
    author.get("/api/support/requests").andExpect(jsonPath("$.total").value(0));
    operator.get("/api/support/operator/requests/" + mine).andExpect(status().isOk())
      .andExpect(jsonPath("$.erased").value(true)).andExpect(jsonPath("$.message").doesNotExist())
      .andExpect(jsonPath("$.author").doesNotExist()).andExpect(jsonPath("$.email").doesNotExist());
    assertThat(jdbc.sql("SELECT COUNT(*) FROM platform_support_entry WHERE text IS NOT NULL").query(Long.class).single()).isZero();
    assertThat(jdbc.sql("SELECT COUNT(*) FROM platform_support_attachment_content").query(Long.class).single()).isZero();
    assertThat(jdbc.sql("SELECT COUNT(*) FROM platform_support_request WHERE message IS NOT NULL OR guest_email IS NOT NULL"
      + " OR author_account IS NOT NULL").query(Long.class).single()).isZero();
    JsonNode listed = body(operator.get("/api/support/operator/requests"));
    assertThat(listed.get("total").asLong()).isEqualTo(2);
    assertThat(listed.get("items").get(0).get("excerpt").isNull()).isTrue();
    assertThat(guest).isNotBlank();
    assertThat(accounts.delete(player)).isEqualTo(io.github.apocarteres.platform.auth.Removal.REMOVED);
  }

  // REQ-SUPPORT-015, REQ-NOTIFICATIONS-007
  @Test
  @DisplayName("С колокольчиком: операторы узнают о новом обращении и сообщении автора, автор с учётной записью — об ответе")
  void bellRingsForBothSides() throws Exception {
    UUID player = account("player@site.example", "USER");
    UUID first = account("operator@site.example", "USER", "ADMIN");
    UUID second = account("second@site.example", "USER", "ADMIN");
    String id = submitted(new Tab().signIn("player@site.example"), request("вопрос"));
    new Tab().signIn("operator@site.example")
      .post("/api/support/operator/requests/" + id + "/messages", "{\"text\":\"ответ\"}").andExpect(status().isOk());
    String guestId = submitted(new Tab("192.0.2.9"), guest("гость", "guest@mail.example"));
    List<String> rows = jdbc.sql("SELECT account_id || ' ' || kind || ' ' || COALESCE(link, '') FROM platform_notification ORDER BY seq")
      .query(String.class).list();
    assertThat(rows).containsExactly(
      first + " support.arrived /support/operator/requests/" + id,
      second + " support.arrived /support/operator/requests/" + id,
      player + " support.answered /support/requests/" + id,
      first + " support.arrived /support/operator/requests/" + guestId,
      second + " support.arrived /support/operator/requests/" + guestId);
    assertThat(jdbc.sql("SELECT params FROM platform_notification WHERE kind = 'support.answered'").query(String.class).single())
      .contains("\"number\"");
  }

  // REQ-SUPPORT-012
  @Test
  @DisplayName("Доступ: автор видит только своё, чужое — как несуществующее; места оператора — только роли оператора")
  void accessIsNarrow() throws Exception {
    account("player@site.example", "USER");
    account("other@site.example", "USER");
    String id = submitted(new Tab().signIn("player@site.example"), request("моё"));
    Tab other = new Tab().signIn("other@site.example");
    other.get("/api/support/requests/" + id).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("request-not-found"));
    other.post("/api/support/requests/" + id + "/messages", "{\"text\":\"чужое\"}").andExpect(status().isNotFound());
    other.get("/api/support/operator/requests").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("access-denied"));
    other.get("/api/support/operator/requests/" + id).andExpect(status().isForbidden());
    new Tab().get("/api/support/operator/requests").andExpect(status().isUnauthorized());
  }

  record Arrival(ArrivalNotice notice, boolean committed) {
  }

  static final class Letters implements SupportLetters {

    final List<AnswerNotice> answers = new CopyOnWriteArrayList<>();
    final List<Arrival> arrivals = new CopyOnWriteArrayList<>();
    volatile boolean failing;
    private final DataSource source;

    Letters(DataSource source) {
      this.source = source;
    }

    @Override
    public void answered(AnswerNotice letter) {
      if (failing) {
        throw new IllegalStateException("почта недоступна");
      }
      answers.add(letter);
    }

    // REQ-SUPPORT-009
    @Override
    public void arrived(ArrivalNotice notice) {
      try (var connection = source.getConnection();
        var query = connection.prepareStatement("SELECT COUNT(*) FROM platform_support_request WHERE id = ?")) {
        query.setObject(1, notice.request());
        try (var rows = query.executeQuery()) {
          arrivals.add(new Arrival(notice, rows.next() && rows.getInt(1) == 1));
        }
      } catch (java.sql.SQLException failure) {
        throw new IllegalStateException(failure);
      }
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
    Letters supportLetters(DataSource source) {
      return new Letters(source);
    }

    @Bean
    AuthLetters authLetters() {
      return new NoLetters();
    }

    // REQ-SUPPORT-002
    @Bean
    GuestIntake guestIntake() {
      return request -> request.getHeader("X-Guest-Closed") == null;
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
      return rules -> rules.requestMatchers("/api/**").hasRole("ADMIN");
    }

    @Bean
    @Primary
    MutableClock clock() {
      return MutableClock.at("2026-09-25T10:00:00Z");
    }
  }
}
