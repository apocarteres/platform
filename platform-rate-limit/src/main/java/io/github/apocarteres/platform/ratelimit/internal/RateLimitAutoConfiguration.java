package io.github.apocarteres.platform.ratelimit.internal;

import io.github.apocarteres.platform.ratelimit.RateLimiter;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

// REQ-AUTH-011, REQ-QUALITY-012
@AutoConfiguration(after = DataRedisAutoConfiguration.class)
public class RateLimitAutoConfiguration {

  // REQ-AUTH-027
  @Bean
  RateLimiter rateLimiter(RedisConnectionFactory connections, Environment environment) {
    return new RedisRateLimiter(new StringRedisTemplate(connections), RateLimitSettings.of(environment).scale());
  }
}
