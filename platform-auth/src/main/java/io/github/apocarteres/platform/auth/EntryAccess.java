package io.github.apocarteres.platform.auth;

import jakarta.servlet.http.HttpServletRequest;

// REQ-AUTH-016
public interface EntryAccess {

  EntryAccess OPEN = request -> true;

  boolean allowed(HttpServletRequest request);
}
