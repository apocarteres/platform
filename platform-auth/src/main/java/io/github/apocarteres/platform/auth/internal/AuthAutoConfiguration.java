package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.ApiAccess;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.EntryAccess;
import io.github.apocarteres.platform.auth.HumanCheck;
import io.github.apocarteres.platform.auth.RegistrationHook;
import io.github.apocarteres.platform.persistence.SqlStatements;
import io.github.apocarteres.platform.ratelimit.RateLimiter;
import io.github.apocarteres.platform.web.errors.ErrorMessages;
import java.time.Clock;
import java.util.UUID;
import jakarta.validation.Validator;
import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceTransactionManagerAutoConfiguration;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.security.autoconfigure.web.servlet.ServletWebSecurityAutoConfiguration;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.session.config.SessionRepositoryCustomizer;
import org.springframework.session.data.redis.RedisIndexedSessionRepository;
import org.springframework.session.data.redis.config.annotation.web.http.EnableRedisIndexedHttpSession;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-AUTH-001, REQ-AUTH-008, REQ-AUTH-014, REQ-QUALITY-012
@AutoConfiguration(
  before = {ServletWebSecurityAutoConfiguration.class, UserDetailsServiceAutoConfiguration.class},
  after = {DataRedisAutoConfiguration.class, DataSourceTransactionManagerAutoConfiguration.class},
  afterName = {
    "io.github.apocarteres.platform.web.errors.internal.WebErrorsAutoConfiguration",
    "io.github.apocarteres.platform.persistence.internal.PersistenceAutoConfiguration",
    "io.github.apocarteres.platform.time.internal.TimeAutoConfiguration",
    "io.github.apocarteres.platform.ratelimit.internal.RateLimitAutoConfiguration",
  }
)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@EnableWebSecurity
public class AuthAutoConfiguration {

  static final String CATALOG = "platform-auth";

  @Bean
  AuthSettings authSettings(Environment environment) {
    return AuthSettings.of(environment);
  }

  // REQ-AUTH-007
  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  AccountStore accountStore(DataSource source, SqlStatements statements, Clock clock) {
    return new AccountStore(JdbcClient.create(source), statements.catalog(CATALOG), clock);
  }

  @Bean
  TokenStore tokenStore(DataSource source, SqlStatements statements, Clock clock) {
    return new TokenStore(JdbcClient.create(source), statements.catalog(CATALOG), clock);
  }

  @Bean
  Sessions accountSessions(FindByIndexNameSessionRepository<? extends Session> repository) {
    return new Sessions(repository);
  }

  // REQ-AUTH-003, REQ-AUTH-009
  @Bean
  AccountCreation accountCreation(AccountStore accounts, PasswordEncoder passwords, RegistrationHook<?> hook, Validator validator,
    AuthSettings settings) {
    return new AccountCreation(accounts, passwords, new ProfileReader(hook, validator), settings);
  }

  // REQ-AUTH-003, REQ-AUTH-010, REQ-AUTH-017
  @Bean
  AuthService authService(AccountStore accounts, TokenStore tokens, Sessions sessions, PasswordEncoder passwords,
    RateLimiter limiter, HumanCheck human, AccountCreation creation, ApplicationEventPublisher events, AuthLetters letters,
    PlatformTransactionManager transactions, AuthSettings settings, Clock clock) {
    return new AuthService(accounts, tokens, sessions, passwords, limiter, human, creation, events, letters,
      new TransactionTemplate(transactions), settings, clock);
  }

  @Bean
  Accounts accounts(AccountStore accounts, TokenStore tokens, Sessions sessions, AccountCreation creation, PasswordEncoder passwords,
    PlatformTransactionManager transactions, AuthSettings settings, Clock clock) {
    return new AccountsService(accounts, tokens, sessions, creation, passwords, new TransactionTemplate(transactions), settings, clock);
  }

  @Bean
  SecurityContextRepository securityContextRepository() {
    return new HttpSessionSecurityContextRepository();
  }

  @Bean
  AuthController authController(AuthService auth, Accounts accounts, SecurityContextRepository contexts, EntryAccess entry,
    AuthSettings settings) {
    return new AuthController(auth, accounts, contexts, entry, settings);
  }

  // REQ-AUTH-009
  @Bean
  AdminProvisioning adminProvisioning(AccountStore accounts, AccountCreation creation, PlatformTransactionManager transactions,
    AuthSettings settings) {
    return new AdminProvisioning(accounts, creation, new TransactionTemplate(transactions), settings);
  }

  @Bean
  UserDetailsService accountDetails(AccountStore accounts) {
    return name -> {
      UUID id;
      try {
        id = UUID.fromString(name);
      } catch (IllegalArgumentException foreign) {
        throw new UsernameNotFoundException("Учётная запись называется идентификатором");
      }
      AccountStore.Stored stored = accounts.find(id).orElseThrow(() -> new UsernameNotFoundException("Учётной записи нет"));
      return User.withUsername(name)
        .password(stored.passwordHash())
        .authorities(stored.account().roles().stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role)).toList())
        .disabled(stored.account().blocked() || !stored.account().verified())
        .build();
    };
  }

  // REQ-AUTH-008, REQ-AUTH-014
  @Bean
  SecurityFilterChain platformApiSecurity(HttpSecurity http, ApiAccess access, ErrorMessages messages,
    SecurityContextRepository contexts) throws Exception {
    ProblemResponses problems = new ProblemResponses(messages);
    http.securityMatcher("/api/**")
      .authorizeHttpRequests(rules -> {
        rules.requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/verify", "/api/auth/resend",
          "/api/auth/login", "/api/auth/password-reset/request", "/api/auth/password-reset/confirm").permitAll();
        rules.requestMatchers(HttpMethod.GET, "/api/auth/csrf", "/api/auth/policy").permitAll();
        rules.requestMatchers("/api/auth/**").authenticated();
        access.rules(rules);
        rules.anyRequest().authenticated();
      })
      .csrf(csrf -> csrf
        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
      .securityContext(context -> context.securityContextRepository(contexts))
      .exceptionHandling(failures -> failures
        .authenticationEntryPoint(problems.entryPoint())
        .accessDeniedHandler(problems.denied()))
      .formLogin(form -> form.disable())
      .httpBasic(basic -> basic.disable())
      .logout(logout -> logout.disable());
    return http.build();
  }

  // REQ-AUTH-008
  @Configuration(proxyBeanMethods = false)
  @EnableRedisIndexedHttpSession
  static class SessionConfiguration {

    @Bean
    SessionRepositoryCustomizer<RedisIndexedSessionRepository> sessionSettings(AuthSettings settings) {
      return repository -> {
        repository.setDefaultMaxInactiveInterval(settings.sessionTimeout());
        repository.setRedisKeyNamespace(settings.sessionNamespace());
      };
    }

    @Bean
    CookieSerializer cookieSerializer(AuthSettings settings) {
      DefaultCookieSerializer cookie = new DefaultCookieSerializer();
      cookie.setCookieName("SESSION");
      cookie.setCookiePath("/");
      cookie.setUseHttpOnlyCookie(true);
      cookie.setSameSite("Lax");
      cookie.setUseSecureCookie(settings.cookieSecure());
      return cookie;
    }
  }
}
