package io.github.apocarteres.platform.auth;

import jakarta.servlet.http.HttpServletRequest;

// REQ-AUTH-028, REQ-AUTH-031
public interface KeyAccess {

  boolean opens(HttpServletRequest request);
}
