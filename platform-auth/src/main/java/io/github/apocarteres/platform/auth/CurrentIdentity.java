package io.github.apocarteres.platform.auth;

import java.util.Optional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

// REQ-AUTH-039
public final class CurrentIdentity {

  private CurrentIdentity() {
  }

  public static Optional<ExternalIdentity> get() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getDetails() instanceof ExternalIdentity identity) {
      return Optional.of(identity);
    }
    return Optional.empty();
  }
}
