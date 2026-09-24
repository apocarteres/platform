package io.github.apocarteres.platform.persistence;

import java.time.Duration;

// REQ-DEPLOYMENT-028
public interface JobLock {

  boolean claim(String job, Duration hold);

  void release(String job);
}
