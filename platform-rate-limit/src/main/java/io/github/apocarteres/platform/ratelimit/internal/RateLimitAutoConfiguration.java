package io.github.apocarteres.platform.ratelimit.internal;

import io.github.apocarteres.platform.ratelimit.RateLimiter;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

// REQ-AUTH-011, REQ-QUALITY-012
@AutoConfiguration(after = DataRedisAutoConfiguration.class)
public class RateLimitAutoConfiguration {

  @Bean
  RateLimiter rateLimiter(RedisConnectionFactory connections) {
    return new RedisRateLimiter(new StringRedisTemplate(connections));
  }
}
