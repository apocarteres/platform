package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.RequestAuthenticator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

// REQ-AUTH-037, REQ-AUTH-038, REQ-AUTH-039
record ExternalSettings(Set<String> roles, int requestsPerMinute, List<RequestAuthenticator> authenticators) {

  static final String PREFIX = "platform.auth.external.";

  static ExternalSettings of(Environment environment, List<RequestAuthenticator> authenticators) {
    Binder binder = Binder.get(environment);
    Set<String> roles = listed(binder, PREFIX + "roles");
    Set<String> shared = roles.stream().filter(listed(binder, "platform.auth.roles")::contains).collect(Collectors.toSet());
    if (!shared.isEmpty()) {
      throw new IllegalStateException("Настройка " + PREFIX + "roles: роли " + shared + " объявлены и для учётных записей"
        + " в platform.auth.roles — внешней личности роли сотрудника не даются (REQ-AUTH-039)");
    }
    for (RequestAuthenticator authenticator : authenticators) {
      for (String path : authenticator.paths()) {
        if (!path.startsWith("/api/") || path.equals("/api/**") || path.startsWith("/api/auth") || path.startsWith("/api/*")) {
          throw new IllegalStateException("Путь " + path + " порта " + authenticator.getClass().getName() + ": порт удостоверяет"
            + " свои пути под /api/**, а не все и не точки аутентификации ядра /api/auth/** (REQ-AUTH-037)");
        }
      }
    }
    int limit = binder.bind(PREFIX + "requests-per-minute", Integer.class).orElse(120);
    if (limit < 1 || limit > 100_000) {
      throw new IllegalStateException("Настройка " + PREFIX + "requests-per-minute: " + limit + " — допустимо от 1 до 100000");
    }
    return new ExternalSettings(roles, limit, List.copyOf(authenticators));
  }

  private static Set<String> listed(Binder binder, String key) {
    return binder.bind(key, Bindable.listOf(String.class)).orElse(List.of()).stream().map(String::trim).collect(Collectors.toSet());
  }
}
