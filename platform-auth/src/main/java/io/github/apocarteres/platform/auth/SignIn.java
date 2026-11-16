package io.github.apocarteres.platform.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;

// REQ-AUTH-048
public interface SignIn {

  Account signIn(UUID account, HttpServletRequest request, HttpServletResponse response);
}
