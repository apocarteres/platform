package io.github.apocarteres.platform.auth;

import java.util.Optional;
import java.util.UUID;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

// REQ-AUTH-001
public final class CurrentAccount {

  private CurrentAccount() {
  }

  public static Optional<UUID> id() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !authentication.isAuthenticated() || authentication instanceof AnonymousAuthenticationToken) {
      return Optional.empty();
    }
    try {
      return Optional.of(UUID.fromString(authentication.getName()));
    } catch (IllegalArgumentException foreign) {
      return Optional.empty();
    }
  }
}
