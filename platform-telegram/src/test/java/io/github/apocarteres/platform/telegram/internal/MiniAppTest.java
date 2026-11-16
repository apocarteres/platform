package io.github.apocarteres.platform.telegram.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.auth.ApiAccess;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.auth.CurrentIdentity;
import io.github.apocarteres.platform.auth.ExternalIdentity;
import io.github.apocarteres.platform.telegram.MiniAppUser;
import io.github.apocarteres.platform.telegram.TelegramLinks;
import io.github.apocarteres.platform.telegram.TelegramMiniApp;
import io.github.apocarteres.platform.time.MutableClock;
import jakarta.servlet.Filter;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;

// REQ-TELEGRAM-018, REQ-TELEGRAM-019
@SpringBootTest(
  classes = MiniAppTest.App.class,
  properties = {
    "spring.liquibase.enabled=false",
    "platform.auth.roles=USER",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
    "platform.auth.external.roles=CLIENT",
    "platform.telegram.bots.news.name=site_news_bot",
    "platform.telegram.bots.news.mini-app.paths=/api/app/**",
    "platform.telegram.bots.news.mini-app.roles=CLIENT",
    "platform.telegram.bots.support.name=site_support_bot",
    "platform.telegram.mini-app.max-age=PT1H",
  }
)
class MiniAppTest {

  @DynamicPropertySource
  static void stores(DynamicPropertyRegistry registry) {
    LinkFlowTest.stores(registry);
  }

  @Autowired
  private WebApplicationContext context;
  @Autowired
  private MutableClock clock;
  @Autowired
  private StringRedisTemplate redis;
  @Autowired
  private DataSource source;
  @Autowired
  private TelegramLinks links;
  @Autowired
  private io.github.apocarteres.platform.auth.Accounts accounts;

  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    JdbcClient.create(source).sql("DELETE FROM platform_account").update();
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    clock.set(InitDataTest.NOW);
    mvc = MockMvcBuilders.webAppContextSetup(context)
      .addFilters(context.getBean("springSessionRepositoryFilter", Filter.class), context.getBean("springSecurityFilterChain", Filter.class))
      .build();
  }

  private ResultActions me(String initData) throws Exception {
    var request = MockMvcRequestBuilders.get("/api/app/me");
    if (initData != null) {
      request.header(MiniAppAuthenticator.HEADER, initData);
    }
    return mvc.perform(request);
  }

  @Test
  @DisplayName("Верная initData бота — внешняя личность telegram с ролями этого бота и пользователь Mini App в запросе")
  void signedInitDataIsAnIdentity() throws Exception {
    me(InitDataTest.signed(LinkFlowTest.BOT_TOKEN, InitDataTest.fields(InitDataTest.NOW.minusSeconds(30)))).andExpect(status().isOk())
      .andExpect(jsonPath("$.kind").value("telegram")).andExpect(jsonPath("$.id").value("7001"))
      .andExpect(jsonPath("$.roles[0]").value("CLIENT")).andExpect(jsonPath("$.bot").value("news"))
      .andExpect(jsonPath("$.username").value("player")).andExpect(jsonPath("$.account").value("нет"));
  }

  @Test
  @DisplayName("Без initData, с подделкой, подписью другого бота и просроченная — identity-rejected")
  void refusesTheRest() throws Exception {
    Map<String, String> fields = InitDataTest.fields(InitDataTest.NOW.minusSeconds(30));
    me(null).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("identity-rejected"));
    me(InitDataTest.signed(LinkFlowTest.BOT_TOKEN, fields).replace("query_id=AAE", "query_id=AAF")).andExpect(status().isUnauthorized());
    me(InitDataTest.signed(LinkFlowTest.SUPPORT_TOKEN, fields)).andExpect(status().isUnauthorized());
    clock.advance(Duration.ofHours(1));
    me(InitDataTest.signed(LinkFlowTest.BOT_TOKEN, fields)).andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("identity-rejected"));
  }

  @Test
  @DisplayName("Пользователь Mini App со связью находит свою учётную запись через TelegramLinks.account")
  void linkedUserFindsTheAccount() {
    UUID account = accounts.create("player@site.example", LinkFlowTest.PASSWORD, Set.of("USER"), true, null).id();
    JdbcClient.create(source).sql("INSERT INTO platform_telegram_link (account_id, bot, telegram_user, chat_id, linked_at)"
      + " VALUES (:a, 'news', 7001, 7001, :t)").param("a", account).param("t", OffsetDateTime.parse("2026-11-16T09:00:00Z")).update();
    assertThat(links.account("news", 7001L)).hasValue(account);
    assertThat(links.account("support", 7001L)).isEmpty();
  }

  @RestController
  static class Me {

    @GetMapping("/api/app/me")
    Map<String, Object> me() {
      ExternalIdentity identity = CurrentIdentity.get().orElseThrow();
      MiniAppUser user = TelegramMiniApp.user().orElseThrow();
      Map<String, Object> me = new LinkedHashMap<>();
      me.put("kind", identity.kind());
      me.put("id", identity.id());
      me.put("roles", identity.roles());
      me.put("bot", user.bot());
      me.put("username", user.username());
      me.put("account", CurrentAccount.id().map(UUID::toString).orElse("нет"));
      return me;
    }
  }

  @Configuration(proxyBeanMethods = false)
  @Import(LinkFlowTest.Service.class)
  static class App {

    @Bean
    Me me() {
      return new Me();
    }

    @Bean
    @Primary
    ApiAccess miniAppAccess() {
      return rules -> {
        rules.requestMatchers("/api/app/**").hasRole("CLIENT");
        rules.requestMatchers("/api/**").denyAll();
      };
    }
  }
}
