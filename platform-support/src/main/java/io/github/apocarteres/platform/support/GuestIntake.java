package io.github.apocarteres.platform.support;

import jakarta.servlet.http.HttpServletRequest;

// REQ-SUPPORT-002
public interface GuestIntake {

  GuestIntake OPEN = request -> true;

  GuestIntake CLOSED = request -> false;

  boolean accepts(HttpServletRequest request);
}
