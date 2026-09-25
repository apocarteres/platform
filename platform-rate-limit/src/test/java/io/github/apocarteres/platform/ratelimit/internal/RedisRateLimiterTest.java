package io.github.apocarteres.platform.ratelimit.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.apocarteres.platform.ratelimit.RateLimit;
import io.github.apocarteres.platform.ratelimit.RateLimitUnavailable;
import io.github.apocarteres.platform.ratelimit.RateLimited;
import java.time.Duration;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.testcontainers.containers.GenericContainer;

// REQ-AUTH-011, REQ-AUTH-013
class RedisRateLimiterTest {

  static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

  private static final RateLimit LOGIN = new RateLimit("login", Duration.ofMinutes(15), 3);

  private static LettuceConnectionFactory connections;
  private static StringRedisTemplate redis;
  private RedisRateLimiter limiter;

  @BeforeAll
  static void start() {
    REDIS.start();
    connections = factory(REDIS.getHost(), REDIS.getMappedPort(6379));
    redis = new StringRedisTemplate(connections);
  }

  @AfterAll
  static void stop() {
    connections.destroy();
    REDIS.stop();
  }

  static LettuceConnectionFactory factory(String host, int port) {
    LettuceConnectionFactory made = new LettuceConnectionFactory(new RedisStandaloneConfiguration(host, port));
    made.afterPropertiesSet();
    return made;
  }

  @BeforeEach
  void setUp() {
    redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    limiter = new RedisRateLimiter(redis);
  }

  @Test
  @DisplayName("До предела действие проходит, сверх предела — отказ 429 с Retry-After в пределах окна")
  void refusesPastTheLimit() {
    for (int attempt = 0; attempt < LOGIN.limit(); attempt++) {
      limiter.consume(LOGIN, "10.0.0.1");
    }
    assertThatThrownBy(() -> limiter.consume(LOGIN, "10.0.0.1"))
      .isInstanceOfSatisfying(RateLimited.class, refused -> {
        assertThat(refused.action()).isEqualTo("login");
        assertThat(refused.retryAfter()).isPositive().isLessThanOrEqualTo(LOGIN.window());
        long seconds = Long.parseLong(refused.getHeaders().getFirst(HttpHeaders.RETRY_AFTER));
        assertThat(seconds).isBetween(1L, LOGIN.window().toSeconds());
        assertThat(refused.code().value()).isEqualTo("rate-limited");
      });
    assertThatCode(() -> limiter.consume(LOGIN, "10.0.0.2")).as("другой субъект — свой счёт").doesNotThrowAnyException();
    assertThatCode(() -> limiter.consume(new RateLimit("register", Duration.ofHours(1), 1), "10.0.0.1"))
      .as("другое действие — свой счёт").doesNotThrowAnyException();
  }

  @Test
  @DisplayName("Счётчик живёт окно с первого обращения, а не продлевается каждым")
  void windowStartsWithTheFirstHit() {
    limiter.consume(LOGIN, "10.0.0.1");
    String key = RedisRateLimiter.keyOf(LOGIN, "10.0.0.1");
    Long first = redis.getExpire(key, java.util.concurrent.TimeUnit.MILLISECONDS);
    assertThat(first).isPositive().isLessThanOrEqualTo(LOGIN.window().toMillis());
    redis.expire(key, Duration.ofSeconds(5));
    limiter.consume(LOGIN, "10.0.0.1");
    assertThat(redis.getExpire(key, java.util.concurrent.TimeUnit.SECONDS)).as("второе обращение срок не сдвигает").isLessThanOrEqualTo(5);
  }

  @Test
  @DisplayName("Проверка без счёта, счёт без отказа и сброс дают считать только неудачи")
  void failuresOnly() {
    for (int attempt = 0; attempt < LOGIN.limit(); attempt++) {
      limiter.require(LOGIN, "user@example.test");
      limiter.count(LOGIN, "user@example.test");
    }
    limiter.count(LOGIN, "user@example.test");
    assertThatThrownBy(() -> limiter.require(LOGIN, "user@example.test")).isInstanceOf(RateLimited.class);
    limiter.clear(LOGIN, "user@example.test");
    assertThatCode(() -> limiter.require(LOGIN, "user@example.test")).doesNotThrowAnyException();
  }

  @Test
  @DisplayName("В хранилище субъект лежит отпечатком: ни почты, ни адреса сети")
  void subjectsAreStoredAsDigests() {
    limiter.consume(LOGIN, "user@example.test");
    limiter.consume(LOGIN, "10.0.0.1|user@example.test");
    Set<String> keys = redis.keys("*");
    assertThat(keys).hasSize(2).allSatisfy(key -> {
      assertThat(key).startsWith("platform:rate-limit:login:").doesNotContain("example").doesNotContain("10.0.0.1");
      assertThat(key.substring(key.lastIndexOf(':') + 1)).matches("[0-9a-f]{64}");
    });
  }

  @Test
  @DisplayName("Недоступное хранилище отказывает действию, а не пропускает его")
  void unavailableStoreRefuses() {
    LettuceConnectionFactory nowhere = factory("127.0.0.1", 1);
    try {
      RedisRateLimiter blind = new RedisRateLimiter(new StringRedisTemplate(nowhere));
      assertThatThrownBy(() -> blind.consume(LOGIN, "10.0.0.1"))
        .isInstanceOf(RateLimitUnavailable.class)
        .hasMessageContaining("отклонено, а не пропущено");
      assertThatThrownBy(() -> blind.require(LOGIN, "10.0.0.1")).isInstanceOf(RateLimitUnavailable.class);
    } finally {
      nowhere.destroy();
    }
  }

  @Test
  @DisplayName("Неверное ограничение и пустой субъект не создаются")
  void declarationsAreChecked() {
    assertThatThrownBy(() -> new RateLimit("Login", Duration.ofMinutes(1), 1)).hasMessageContaining("строчные буквы");
    assertThatThrownBy(() -> new RateLimit("login", Duration.ZERO, 1)).hasMessageContaining("положительным");
    assertThatThrownBy(() -> new RateLimit("login", Duration.ofMinutes(1), 0)).hasMessageContaining("не меньше 1");
    assertThatThrownBy(() -> limiter.consume(LOGIN, " ")).hasMessageContaining("нужен субъект");
  }

  // REQ-AUTH-027
  @Test
  @DisplayName("Множитель стенда увеличивает каждый предел, не меняя окна")
  void scaleMultipliesTheLimit() {
    RedisRateLimiter scaled = new RedisRateLimiter(redis, 2);
    for (int attempt = 0; attempt < 6; attempt++) {
      scaled.consume(LOGIN, "198.51.100.9");
    }
    assertThatThrownBy(() -> scaled.consume(LOGIN, "198.51.100.9")).isInstanceOf(RateLimited.class);
    assertThatThrownBy(() -> scaled.require(LOGIN, "198.51.100.9")).isInstanceOf(RateLimited.class);
  }

  // REQ-AUTH-027
  @Test
  @DisplayName("Множитель — от 1 до 1000 и не в профиле production: там служба не стартует")
  void scaleIsRefusedInProduction() {
    org.springframework.mock.env.MockEnvironment stand = new org.springframework.mock.env.MockEnvironment()
      .withProperty("platform.rate-limit.scale", "20");
    assertThat(RateLimitSettings.of(stand).scale()).isEqualTo(20);
    assertThat(RateLimitSettings.of(new org.springframework.mock.env.MockEnvironment()).scale()).isEqualTo(1);
    org.springframework.mock.env.MockEnvironment production = new org.springframework.mock.env.MockEnvironment()
      .withProperty("platform.rate-limit.scale", "20");
    production.setActiveProfiles("production");
    assertThatThrownBy(() -> RateLimitSettings.of(production)).hasMessageContaining("production");
    org.springframework.mock.env.MockEnvironment plain = new org.springframework.mock.env.MockEnvironment();
    plain.setActiveProfiles("production");
    assertThat(RateLimitSettings.of(plain).scale()).isEqualTo(1);
    assertThatThrownBy(() -> RateLimitSettings.of(new org.springframework.mock.env.MockEnvironment()
      .withProperty("platform.rate-limit.scale", "0"))).hasMessageContaining("от 1 до 1000");
    assertThatThrownBy(() -> RateLimitSettings.of(new org.springframework.mock.env.MockEnvironment()
      .withProperty("platform.rate-limit.scale", "1001"))).hasMessageContaining("от 1 до 1000");
  }
}
