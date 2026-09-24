package io.github.apocarteres.platform.ratelimit;

// REQ-AUTH-011
public interface RateLimiter {

  void consume(RateLimit limit, String subject);

  void require(RateLimit limit, String subject);

  void count(RateLimit limit, String subject);

  void clear(RateLimit limit, String subject);
}
