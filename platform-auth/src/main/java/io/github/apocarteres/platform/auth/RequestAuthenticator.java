package io.github.apocarteres.platform.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;
import java.util.Set;

// REQ-AUTH-037, REQ-AUTH-038
public interface RequestAuthenticator {

  Set<String> paths();

  Optional<ExternalIdentity> authenticate(HttpServletRequest request);
}
