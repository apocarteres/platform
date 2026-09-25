package io.github.apocarteres.platform.auth.internal;

import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

// REQ-AUTH-002, REQ-AUTH-004, REQ-AUTH-006, REQ-AUTH-007, REQ-AUTH-008, REQ-AUTH-009, REQ-AUTH-010, REQ-AUTH-023
record AuthSettings(
  Set<String> roles,
  Set<String> defaultRoles,
  URI linkBase,
  String verificationLink,
  String resetLink,
  String emailChangeLink,
  int passwordMinBytes,
  int passwordMaxBytes,
  Duration verificationTtl,
  Duration resetTtl,
  Duration emailChangeTtl,
  Duration resendInterval,
  Duration sessionTimeout,
  boolean cookieSecure,
  String sessionNamespace,
  Optional<Admin> admin
) {

  static final String PREFIX = "platform.auth.";

  // REQ-AUTH-007
  static final int BCRYPT_LIMIT = 72;

  private static final Pattern ROLE = Pattern.compile("[A-Z][A-Z0-9_]*");

  record Admin(String email, String password, Set<String> roles, java.util.Map<String, Object> profile) {
  }

  static AuthSettings of(Environment environment) {
    Binder binder = Binder.get(environment);
    Set<String> roles = roles(binder, "roles", true);
    Set<String> defaults = roles(binder, "default-roles", true);
    for (String role : defaults) {
      if (!roles.contains(role)) {
        throw refused("default-roles", "роль " + role + " не объявлена в " + PREFIX + "roles");
      }
    }
    int min = binder.bind(PREFIX + "password.min-bytes", Integer.class).orElse(10);
    int max = binder.bind(PREFIX + "password.max-bytes", Integer.class).orElse(BCRYPT_LIMIT);
    if (min < 1 || max > BCRYPT_LIMIT || min > max) {
      throw refused("password", "пределы пароля " + min + "…" + max + " байт: от 1, не больше " + BCRYPT_LIMIT
        + " — дальше BCrypt молча обрезает пароль");
    }
    return new AuthSettings(
      roles,
      defaults,
      linkBase(binder),
      binder.bind(PREFIX + "links.verification", String.class).orElse("/auth/verify?token={token}"),
      binder.bind(PREFIX + "links.password-reset", String.class).orElse("/auth/password-reset?token={token}"),
      binder.bind(PREFIX + "links.email-change", String.class).orElse("/auth/email?token={token}"),
      min,
      max,
      duration(binder, "tokens.verification", Duration.ofHours(24)),
      duration(binder, "tokens.password-reset", Duration.ofMinutes(30)),
      duration(binder, "tokens.email-change", Duration.ofHours(24)),
      duration(binder, "tokens.resend-interval", Duration.ofMinutes(1)),
      duration(binder, "session.timeout", Duration.ofHours(8)),
      binder.bind(PREFIX + "session.cookie-secure", Boolean.class).orElse(true),
      binder.bind(PREFIX + "session.namespace", String.class).orElse("platform:session"),
      admin(binder, roles)
    );
  }

  private static Set<String> roles(Binder binder, String key, boolean required) {
    List<String> declared = binder.bind(PREFIX + key, Bindable.listOf(String.class)).orElse(List.of());
    if (required && declared.isEmpty()) {
      throw refused(key, "не задано: перечислите роли проекта, например USER,ADMIN");
    }
    Set<String> roles = new LinkedHashSet<>();
    for (String role : declared) {
      String trimmed = role.trim();
      if (!ROLE.matcher(trimmed).matches()) {
        throw refused(key, "роль «" + role + "»: прописные латинские буквы, цифры и подчёркивание");
      }
      roles.add(trimmed);
    }
    return Set.copyOf(roles);
  }

  private static URI linkBase(Binder binder) {
    String declared = binder.bind(PREFIX + "link-base", String.class)
      .orElseThrow(() -> refused("link-base", "не задано: доверенный адрес сайта, от которого строятся ссылки писем"));
    URI base = URI.create(declared.trim());
    if (!"https".equals(base.getScheme()) && !("http".equals(base.getScheme()) && "localhost".equals(base.getHost()))) {
      throw refused("link-base", declared + ": ссылки писем ведут на https, http допустим только для localhost");
    }
    return base;
  }

  private static Duration duration(Binder binder, String key, Duration fallback) {
    Duration value = binder.bind(PREFIX + key, Duration.class).orElse(fallback);
    if (value.isNegative() || value.isZero()) {
      throw refused(key, value + ": срок должен быть положительным");
    }
    return value;
  }

  // REQ-AUTH-009
  private static Optional<Admin> admin(Binder binder, Set<String> roles) {
    Optional<String> email = binder.bind(PREFIX + "admin.email", String.class).map(Optional::of).orElse(Optional.empty());
    if (email.isEmpty()) {
      return Optional.empty();
    }
    String password = binder.bind(PREFIX + "admin.password", String.class)
      .orElseThrow(() -> refused("admin.password", "не задано: первый администратор объявлен почтой, но без пароля"));
    Set<String> granted = roles(binder, "admin.roles", true);
    for (String role : granted) {
      if (!roles.contains(role)) {
        throw refused("admin.roles", "роль " + role + " не объявлена в " + PREFIX + "roles");
      }
    }
    java.util.Map<String, Object> profile = binder.bind(PREFIX + "admin.profile", Bindable.mapOf(String.class, Object.class))
      .orElse(java.util.Map.of());
    return Optional.of(new Admin(email.get(), password, granted, profile));
  }

  private static IllegalStateException refused(String key, String reason) {
    return new IllegalStateException("Настройка " + PREFIX + key + ": " + reason);
  }

  URI link(String template, String token) {
    return linkBase.resolve(template.replace("{token}", token));
  }
}
