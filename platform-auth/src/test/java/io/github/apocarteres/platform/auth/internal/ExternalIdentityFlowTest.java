package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.ApiAccess;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.auth.CurrentIdentity;
import io.github.apocarteres.platform.auth.EntryAccess;
import io.github.apocarteres.platform.auth.ExternalIdentity;
import io.github.apocarteres.platform.auth.HumanCheck;
import io.github.apocarteres.platform.auth.NoProfile;
import io.github.apocarteres.platform.auth.RegistrationHook;
import io.github.apocarteres.platform.auth.RequestAuthenticator;
import io.github.apocarteres.platform.time.MutableClock;
import jakarta.servlet.Filter;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

// REQ-AUTH-037, REQ-AUTH-038, REQ-AUTH-039
@SpringBootTest(
  classes = ExternalIdentityFlowTest.Service.class,
  properties = {
    "platform.auth.roles=STAFF",
    "platform.auth.default-roles=STAFF",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
    "platform.auth.external.roles=CLIENT,VIP",
    "platform.auth.external.requests-per-minute=4",
  }
)
class ExternalIdentityFlowTest {

  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
  private static final String PASSWORD = "correct horse battery";
  private static final String SIGN = "X-Test-Sign";

  static {
    POSTGRES.start();
    REDIS.start();
    try (var connection = java.sql.DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
      var statement = connection.createStatement()) {
      for (String table : List.of("create-account", "create-role", "create-token")) {
        try (var input = ExternalIdentityFlowTest.class.getResourceAsStream("/sql/platform-auth/" + table + ".sql")) {
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
  private Accounts accounts;
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

  private ResultActions signed(String sign, MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(sign == null ? request : request.header(SIGN, sign));
  }

  private Cookie[] staffSession() throws Exception {
    accounts.create("staff@site.example", PASSWORD, Set.of("STAFF"), true, new NoProfile());
    MockHttpServletResponse csrf = mvc.perform(MockMvcRequestBuilders.get("/api/auth/csrf")).andReturn().getResponse();
    String token = csrf.getContentAsString().replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    MockHttpServletResponse login = mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").cookie(csrf.getCookies())
      .contentType(MediaType.APPLICATION_JSON).header("X-XSRF-TOKEN", token)
      .content("{\"email\":\"staff@site.example\",\"password\":\"" + PASSWORD + "\",\"human\":\"human\"}"))
      .andExpect(status().isOk()).andReturn().getResponse();
    return login.getCookies();
  }

  @Test
  @DisplayName("Подписанный запрос на пути порта — внешняя личность с ролями проекта, без сессии и CSRF")
  void signedRequestIsTheExternalIdentity() throws Exception {
    MockHttpServletResponse read = signed("client-42", MockMvcRequestBuilders.get("/api/telegram/me")).andExpect(status().isOk())
      .andReturn().getResponse();
    assertThat(read.getContentAsString()).isEqualTo("telegram 42 [CLIENT] account=none");
    assertThat(read.getCookies()).as("сессии запрос порта не создаёт").isEmpty();
    signed("client-42", MockMvcRequestBuilders.post("/api/telegram/orders")).andExpect(status().isOk());
    signed("client-42", MockMvcRequestBuilders.get("/api/telegram/staff-only")).andExpect(status().isForbidden())
      .andExpect(jsonPath("$.code").value("access-denied"));
  }

  @Test
  @DisplayName("Без подписи — отказ identity-rejected; cookie сессии сотрудника на пути порта не читается")
  void unsignedIsRejectedEvenWithASession() throws Exception {
    signed(null, MockMvcRequestBuilders.get("/api/telegram/me")).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("identity-rejected"));
    Cookie[] session = staffSession();
    signed(null, MockMvcRequestBuilders.get("/api/telegram/me").cookie(session)).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("identity-rejected"));
    signed(null, MockMvcRequestBuilders.post("/api/telegram/orders").cookie(session)).andExpect(status().isUnauthorized());
    mvc.perform(MockMvcRequestBuilders.get("/api/elsewhere").cookie(session)).andExpect(status().isOk())
      .andExpect(result -> assertThat(result.getResponse().getContentAsString()).isNotEqualTo("none"));
    signed("client-42", MockMvcRequestBuilders.get("/api/elsewhere")).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("authentication-required"));
  }

  @Test
  @DisplayName("Роль вне перечня внешних ролей — отказ, а не роль сотрудника")
  void foreignRoleIsRejected() throws Exception {
    signed("staff-7", MockMvcRequestBuilders.get("/api/telegram/me")).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("identity-rejected"));
    signed("staff-7", MockMvcRequestBuilders.get("/api/telegram/staff-only")).andExpect(status().isUnauthorized());
  }

  @Test
  @DisplayName("Предел частоты — на каждую личность")
  void limitPerIdentity() throws Exception {
    for (int one = 0; one < 4; one++) {
      signed("client-1", MockMvcRequestBuilders.get("/api/telegram/me")).andExpect(status().isOk());
    }
    signed("client-1", MockMvcRequestBuilders.get("/api/telegram/me")).andExpect(status().isTooManyRequests())
      .andExpect(jsonPath("$.code").value("rate-limited"));
    signed("client-2", MockMvcRequestBuilders.get("/api/telegram/me")).andExpect(status().isOk());
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
      return rules -> rules.requestMatchers("/api/telegram/staff-only").hasRole("STAFF")
        .requestMatchers("/api/telegram/**").hasRole("CLIENT");
    }

    // REQ-AUTH-037
    @Bean
    RequestAuthenticator telegram() {
      return new RequestAuthenticator() {
        @Override
        public Set<String> paths() {
          return Set.of("/api/telegram/**");
        }

        @Override
        public Optional<ExternalIdentity> authenticate(HttpServletRequest request) {
          String sign = request.getHeader(SIGN);
          if (sign == null) {
            return Optional.empty();
          }
          if (sign.startsWith("client-")) {
            return Optional.of(new ExternalIdentity("telegram", sign.substring(7), Set.of("CLIENT")));
          }
          if (sign.startsWith("staff-")) {
            return Optional.of(new ExternalIdentity("telegram", sign.substring(6), Set.of("STAFF")));
          }
          return Optional.empty();
        }
      };
    }

    @Bean
    @Primary
    MutableClock clock() {
      return MutableClock.at("2026-09-30T10:00:00Z");
    }

    @Bean
    Things things() {
      return new Things();
    }
  }

  @RestController
  static class Things {

    @GetMapping({"/api/telegram/me", "/api/telegram/staff-only"})
    String me() {
      ExternalIdentity identity = CurrentIdentity.get().orElseThrow();
      return identity.kind() + " " + identity.id() + " " + identity.roles() + " account="
        + CurrentAccount.id().map(Object::toString).orElse("none");
    }

    @PostMapping("/api/telegram/orders")
    String order() {
      return "принято";
    }

    @GetMapping("/api/elsewhere")
    String elsewhere() {
      return CurrentAccount.id().map(Object::toString).orElse("none");
    }
  }
}
