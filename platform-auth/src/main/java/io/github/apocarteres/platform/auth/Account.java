package io.github.apocarteres.platform.auth;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

// REQ-AUTH-001
public record Account(
  UUID id,
  String email,
  Set<String> roles,
  boolean verified,
  boolean blocked,
  Instant createdAt,
  Instant lastLoginAt
) {

  public Account {
    roles = Set.copyOf(roles);
  }

  public boolean has(String role) {
    return roles.contains(role);
  }
}
