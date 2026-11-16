package io.github.apocarteres.platform.telegram.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.telegram.TelegramCodeText;
import io.github.apocarteres.platform.time.MutableClock;
import jakarta.servlet.Filter;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

// REQ-TELEGRAM-020, REQ-TELEGRAM-021, REQ-AUTH-048
@SpringBootTest(
  classes = SignInTest.Codes.class,
  properties = {
    "spring.liquibase.enabled=false",
    "platform.auth.roles=USER",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
    "platform.telegram.bots.news.name=site_news_bot",
    "platform.telegram.bots.support.name=site_support_bot",
    "platform.telegram.second-factor.bot=support",
  }
)
class SignInTest {

  private static final Instant NOW = Instant.parse("2026-11-16T10:00:00Z");
  private static final Pattern CODE = Pattern.compile("код ([0-9]{6})");

  @DynamicPropertySource
  static void stores(DynamicPropertyRegistry registry) {
    LinkFlowTest.stores(registry);
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

  private MockMvc mvc;
  private JdbcClient jdbc;

  @BeforeEach
  void setUp() {
    jdbc = JdbcClient.create(source);
    jdbc.sql("DELETE FROM platform_account").update();
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    clock.set(NOW);
    LinkFlowTest.BOT_API.calls.clear();
    LinkFlowTest.BOT_API.queued.clear();
    LinkFlowTest.BOT_API.answer = "{\"ok\":true,\"result\":{}}";
    mvc = MockMvcBuilders.webAppContextSetup(context)
      .addFilters(context.getBean("springSessionRepositoryFilter", Filter.class), context.getBean("springSecurityFilterChain", Filter.class))
      .build();
  }

  final class Tab {

    private final List<Cookie> cookies = new ArrayList<>();
    private String csrf;

    Tab() throws Exception {
      refresh();
    }

    void refresh() throws Exception {
      csrf = send(MockMvcRequestBuilders.get("/api/auth/csrf")).andReturn().getResponse().getContentAsString()
        .replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    ResultActions post(String path, String body) throws Exception {
      return send(MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON).content(body).header("X-XSRF-TOKEN", csrf));
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

  // REQ-TELEGRAM-020
  static String widget(String token, long user, Instant authDate) {
    try {
      Map<String, String> fields = new TreeMap<>();
      fields.put("id", Long.toString(user));
      fields.put("first_name", "Имя");
      fields.put("username", "player");
      fields.put("auth_date", Long.toString(authDate.getEpochSecond()));
      String check = fields.entrySet().stream().map(one -> one.getKey() + "=" + one.getValue()).collect(Collectors.joining("\n"));
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)), "HmacSHA256"));
      String hash = HexFormat.of().formatHex(mac.doFinal(check.getBytes(StandardCharsets.UTF_8)));
      return "{\"id\":" + user + ",\"first_name\":\"Имя\",\"username\":\"player\",\"auth_date\":" + authDate.getEpochSecond()
        + ",\"hash\":\"" + hash + "\"}";
    } catch (java.security.GeneralSecurityException impossible) {
      throw new IllegalStateException(impossible);
    }
  }

  private UUID account(String email) {
    return accounts.create(email, LinkFlowTest.PASSWORD, Set.of("USER"), true, null).id();
  }

  private void link(UUID account, String bot, long user) {
    jdbc.sql("INSERT INTO platform_telegram_link (account_id, bot, telegram_user, chat_id, linked_at, language) VALUES (:a, :b, :u, :u, :t, 'ru')")
      .param("a", account).param("b", bot).param("u", user).param("t", OffsetDateTime.parse("2026-11-16T09:00:00Z")).update();
  }

  private String sentCode() {
    Matcher found = CODE.matcher(LinkFlowTest.BOT_API.calls.getLast().body());
    assertThat(found.find()).isTrue();
    return found.group(1);
  }

  @Test
  @DisplayName("Подписанные данные виджета связанного человека открывают обычную сессию ядра")
  void signsInTheLinkedAccount() throws Exception {
    UUID id = account("player@site.example");
    link(id, "news", 7001L);
    Tab tab = new Tab();
    tab.post("/api/telegram/news/login", widget(LinkFlowTest.BOT_TOKEN, 7001L, NOW.minusSeconds(30))).andExpect(status().isOk())
      .andExpect(jsonPath("$.id").value(id.toString())).andExpect(jsonPath("$.email").value("player@site.example"));
    tab.send(MockMvcRequestBuilders.get("/api/auth/session")).andExpect(jsonPath("$.account.id").value(id.toString()));
  }

  @Test
  @DisplayName("Подделка, чужой бот, просрочка и человек без связи — один отказ credentials-rejected; блокировка — account-blocked")
  void refusesTheRest() throws Exception {
    UUID id = account("player@site.example");
    link(id, "news", 7001L);
    Tab tab = new Tab();
    String valid = widget(LinkFlowTest.BOT_TOKEN, 7001L, NOW.minusSeconds(30));
    tab.post("/api/telegram/news/login", valid.replace("player", "playor")).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("credentials-rejected"));
    tab.post("/api/telegram/news/login", widget(LinkFlowTest.SUPPORT_TOKEN, 7001L, NOW)).andExpect(jsonPath("$.code").value("credentials-rejected"));
    tab.post("/api/telegram/news/login", widget(LinkFlowTest.BOT_TOKEN, 7001L, NOW.minus(Duration.ofMinutes(11))))
      .andExpect(jsonPath("$.code").value("credentials-rejected"));
    tab.post("/api/telegram/news/login", widget(LinkFlowTest.BOT_TOKEN, 7002L, NOW)).andExpect(jsonPath("$.code").value("credentials-rejected"));
    tab.post("/api/telegram/nobody/login", valid).andExpect(status().isNotFound());
    accounts.block(id);
    tab.post("/api/telegram/news/login", valid).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("account-blocked"));
    tab.send(MockMvcRequestBuilders.get("/api/auth/session")).andExpect(jsonPath("$.account").isEmpty());
  }

  @Test
  @DisplayName("Второй шаг: связанной с ботом второго шага записи код приходит в Telegram и принимается один раз")
  void secondFactorCodeComesToTelegram() throws Exception {
    UUID id = account("player@site.example");
    link(id, "news", 7001L);
    link(id, "support", 7001L);
    Tab tab = new Tab();
    tab.post("/api/telegram/news/login", widget(LinkFlowTest.BOT_TOKEN, 7001L, NOW)).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("second-factor-required"));
    assertThat(LinkFlowTest.BOT_API.calls.getLast().path()).isEqualTo("/bot" + LinkFlowTest.SUPPORT_TOKEN + "/sendMessage");
    String code = sentCode();
    tab.refresh();
    tab.post("/api/auth/login/second-factor", "{\"code\":\"" + code + "\"}").andExpect(status().isOk())
      .andExpect(jsonPath("$.id").value(id.toString()));
    assertThat(jdbc.sql("SELECT COUNT(*) FROM platform_telegram_code").query(Long.class).single()).isZero();

    Tab other = new Tab();
    other.post("/api/auth/login", "{\"email\":\"player@site.example\",\"password\":\"" + LinkFlowTest.PASSWORD + "\"}")
      .andExpect(jsonPath("$.code").value("second-factor-required"));
    String next = sentCode();
    other.refresh();
    String wrong = next.equals("000000") ? "000001" : "000000";
    other.post("/api/auth/login/second-factor", "{\"code\":\"" + wrong + "\"}").andExpect(jsonPath("$.code").value("second-factor-rejected"));
    other.post("/api/auth/login/second-factor", "{\"code\":\"" + next + "\"}").andExpect(jsonPath("$.code").value("second-factor-rejected"));
  }

  @Test
  @DisplayName("Запись без связи с ботом второго шага входит без кода")
  void noLinkNoSecondStep() throws Exception {
    UUID id = account("player@site.example");
    link(id, "news", 7001L);
    new Tab().post("/api/auth/login", "{\"email\":\"player@site.example\",\"password\":\"" + LinkFlowTest.PASSWORD + "\"}")
      .andExpect(status().isOk());
    assertThat(LinkFlowTest.BOT_API.calls).isEmpty();
  }

  @Configuration(proxyBeanMethods = false)
  @Import(LinkFlowTest.Service.class)
  static class Codes {

    // REQ-TELEGRAM-021
    @Bean
    TelegramCodeText telegramCodeText() {
      return (bot, language, code) -> language + " код " + code;
    }
  }
}
