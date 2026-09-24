package io.github.apocarteres.platform.ratelimit.internal;

import io.github.apocarteres.platform.ratelimit.RateLimit;
import io.github.apocarteres.platform.ratelimit.RateLimitUnavailable;
import io.github.apocarteres.platform.ratelimit.RateLimited;
import io.github.apocarteres.platform.ratelimit.RateLimiter;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

// REQ-AUTH-011
final class RedisRateLimiter implements RateLimiter {

  private static final String PREFIX = "platform:rate-limit:";

  @SuppressWarnings("rawtypes")
  private static final RedisScript<List> INCREMENT = RedisScript.of(
    "local count = redis.call('INCR', KEYS[1]) "
      + "if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end "
      + "return {count, redis.call('PTTL', KEYS[1])}",
    List.class
  );

  private final StringRedisTemplate redis;

  RedisRateLimiter(StringRedisTemplate redis) {
    this.redis = redis;
  }

  @Override
  public void consume(RateLimit limit, String subject) {
    long[] state = increment(limit, subject);
    if (state[0] > limit.limit()) {
      throw new RateLimited(limit.action(), Duration.ofMillis(Math.max(state[1], 1)));
    }
  }

  @Override
  public void require(RateLimit limit, String subject) {
    String key = keyOf(limit, subject);
    try {
      String value = redis.opsForValue().get(key);
      if (value != null && Long.parseLong(value) >= limit.limit()) {
        Long left = redis.getExpire(key, java.util.concurrent.TimeUnit.MILLISECONDS);
        throw new RateLimited(limit.action(), Duration.ofMillis(left == null || left < 1 ? limit.window().toMillis() : left));
      }
    } catch (DataAccessException failure) {
      throw new RateLimitUnavailable(limit.action(), failure);
    }
  }

  @Override
  public void count(RateLimit limit, String subject) {
    increment(limit, subject);
  }

  @Override
  public void clear(RateLimit limit, String subject) {
    try {
      redis.delete(keyOf(limit, subject));
    } catch (DataAccessException failure) {
      throw new RateLimitUnavailable(limit.action(), failure);
    }
  }

  private long[] increment(RateLimit limit, String subject) {
    try {
      List<?> answer = redis.execute(INCREMENT, List.of(keyOf(limit, subject)), Long.toString(limit.window().toMillis()));
      return new long[] {((Number) answer.get(0)).longValue(), ((Number) answer.get(1)).longValue()};
    } catch (DataAccessException failure) {
      throw new RateLimitUnavailable(limit.action(), failure);
    }
  }

  // REQ-AUTH-013
  static String keyOf(RateLimit limit, String subject) {
    if (subject == null || subject.isBlank()) {
      throw new IllegalArgumentException("Ограничению " + limit.action() + " нужен субъект: адрес сети, почта или их пара");
    }
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(subject.getBytes(StandardCharsets.UTF_8));
      return PREFIX + limit.action() + ":" + HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }
}
