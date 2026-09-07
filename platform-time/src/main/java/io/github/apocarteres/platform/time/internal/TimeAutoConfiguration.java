package io.github.apocarteres.platform.time.internal;

import java.time.Clock;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;

// REQ-JAVA-CLOCK-002, REQ-JAVA-CLOCK-005
@AutoConfiguration
public class TimeAutoConfiguration {

  @Bean
  @ConditionalOnMissingBean
  public Clock clock() {
    return Clock.systemUTC();
  }
}
