package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

// REQ-AUTH-031
class KeyPathTest {

  @Test
  @DisplayName("Однозначный путь — как есть, закодированные не-ASCII знаки декодируются; путь — внутри приложения")
  void plainPaths() {
    assertThat(KeyPath.of(request("", "/api/things"))).contains("/api/things");
    assertThat(KeyPath.of(request("", "/api/things/"))).contains("/api/things/");
    assertThat(KeyPath.of(request("", "/api/releases/%D0%B2%D1%8B%D0%BF%D1%83%D1%81%D0%BA%201"))).contains("/api/releases/выпуск 1");
    assertThat(KeyPath.of(request("/app", "/app/api/things"))).contains("/api/things");
  }

  @ParameterizedTest
  @ValueSource(strings = {
    "/api/%61uth/keys",
    "/api/%41UTH/keys",
    "/api/auth%2fkeys",
    "/api/auth%2Fkeys",
    "/api/x/%2e%2e/auth/keys",
    "/api/x/%2E%2E/auth/keys",
    "/api/x/.%2e/auth/keys",
    "/api/x/../auth/keys",
    "/api/./auth/keys",
    "/api/x/%2e/auth/keys",
    "/api//auth/keys",
    "/api/auth;x=1/keys",
    "/api/auth%3bx/keys",
    "/api\\auth/keys",
    "/api/auth%5ckeys",
    "/api/%2561uth/keys",
    "/api/%zz/keys",
    "/api/%6",
    "/api/%7e",
    "/api/%30",
    "api/auth/keys",
  })
  @DisplayName("Неоднозначный адрес — пусто: закодированная латиница и знаки структуры, «.», «..», «//», «;», «\\», битая кодировка")
  void ambiguousPaths(String uri) {
    assertThat(KeyPath.of(request("", uri))).isEmpty();
  }

  @Test
  @DisplayName("Адрес вне контекста приложения — пусто")
  void outsideContext() {
    assertThat(KeyPath.of(request("/app", "/other/api/things"))).isEmpty();
  }

  private static MockHttpServletRequest request(String context, String uri) {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
    request.setContextPath(context);
    return request;
  }
}
