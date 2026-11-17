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
  @DisplayName("Путь внутри приложения декодируется: латиница, «~», не-ASCII и пробел — как их сопоставит сервер")
  void decodedPaths() {
    assertThat(KeyPath.of(request("", "/api/things"))).contains("/api/things");
    assertThat(KeyPath.of(request("", "/api/things/"))).contains("/api/things/");
    assertThat(KeyPath.of(request("", "/api/%61dmin/people"))).contains("/api/admin/people");
    assertThat(KeyPath.of(request("", "/api/%7Euser"))).contains("/api/~user");
    assertThat(KeyPath.of(request("", "/api/releases/%D0%B2%D1%8B%D0%BF%D1%83%D1%81%D0%BA%201"))).contains("/api/releases/выпуск 1");
    assertThat(KeyPath.of(request("/app", "/app/api/things"))).contains("/api/things");
    assertThat(KeyPath.of(request("/%61pp", "/%61pp/api/%61uth"))).contains("/api/auth");
  }

  @ParameterizedTest
  @ValueSource(strings = {
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
    "api/auth/keys",
  })
  @DisplayName("Неоднозначный адрес — пусто: знаки структуры, «.», «..», «//», «;», «\\», битая кодировка")
  void ambiguousPaths(String uri) {
    assertThat(KeyPath.of(request("", uri))).isEmpty();
  }

  @Test
  @DisplayName("Адрес вне контекста приложения — пусто")
  void outsideContext() {
    assertThat(KeyPath.of(request("/app", "/other/api/things"))).isEmpty();
  }

  @Test
  @DisplayName("Точки ядра — без учёта регистра, без хвостового «/» и за префиксом сервлета")
  void underCorePaths() {
    MockHttpServletRequest plain = request("", "/api/auth/keys");
    assertThat(KeyPath.under(plain, "/api/auth/keys", "/api/auth")).isTrue();
    assertThat(KeyPath.under(plain, "/api/AUTH/keys", "/api/auth")).isTrue();
    assertThat(KeyPath.under(plain, "/api/auth", "/api/auth")).isTrue();
    assertThat(KeyPath.under(plain, "/api/authors", "/api/auth")).isFalse();
    MockHttpServletRequest prefixed = request("", "/x/api/auth/keys");
    prefixed.setServletPath("/x");
    prefixed.setPathInfo("/api/auth/keys");
    assertThat(KeyPath.under(prefixed, "/x/api/auth/keys", "/api/auth")).isTrue();
  }

  @Test
  @DisplayName("Порт проекта видит декодированный адрес с контекстом — тот же путь, что сопоставит сервер")
  void portSeesDecodedUri() {
    MockHttpServletRequest raw = request("/app", "/app/api/%61dmin/people");
    assertThat(KeyPath.decoded(raw, KeyPath.of(raw).orElseThrow()).getRequestURI()).isEqualTo("/app/api/admin/people");
  }

  private static MockHttpServletRequest request(String context, String uri) {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
    request.setContextPath(context);
    return request;
  }
}
