package io.github.apocarteres.platform.support;

import java.util.UUID;

// REQ-SUPPORT-010, REQ-SUPPORT-011
public interface SupportRetention {

  // REQ-SUPPORT-010
  Expired purgeExpired();

  // REQ-SUPPORT-011
  int erase(UUID account);

  // REQ-SUPPORT-011
  int erase(String guestEmail);
}
