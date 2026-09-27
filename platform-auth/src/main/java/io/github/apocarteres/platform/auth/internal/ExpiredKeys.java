package io.github.apocarteres.platform.auth.internal;

import java.time.Instant;

// REQ-AUTH-034
interface ExpiredKeys {

  ExpiredKeys NONE = before -> 0;

  int purge(Instant before);
}
