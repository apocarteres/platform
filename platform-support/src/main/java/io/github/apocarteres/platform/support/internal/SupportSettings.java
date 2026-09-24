package io.github.apocarteres.platform.support.internal;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

// REQ-SUPPORT-001, REQ-SUPPORT-004, REQ-SUPPORT-009, REQ-SUPPORT-010
record SupportSettings(
  String operatorRole,
  URI linkBase,
  String requestLink,
  String operatorLink,
  String answerLink,
  Duration answerLinkTtl,
  Duration attachmentsKept,
  Duration journalKept,
  Duration guestEmailKept
) {

  static final String PREFIX = "platform.support.";

  static SupportSettings of(Environment environment) {
    Binder binder = Binder.get(environment);
    String role = binder.bind(PREFIX + "operator-role", String.class)
      .orElseThrow(() -> refused("operator-role", "не задано: роль проекта, которой отвечает поддержка, например ADMIN")).trim();
    List<String> roles = binder.bind("platform.auth.roles", Bindable.listOf(String.class)).orElse(List.of())
      .stream().map(String::trim).toList();
    if (!roles.contains(role)) {
      throw refused("operator-role", "роль " + role + " не объявлена в platform.auth.roles");
    }
    String base = binder.bind("platform.auth.link-base", String.class)
      .orElseThrow(() -> refused("link-base", "ссылки писем строятся от platform.auth.link-base, а она не задана"));
    return new SupportSettings(
      role,
      URI.create(base.trim()),
      binder.bind(PREFIX + "links.request", String.class).orElse("/support/requests/{id}"),
      binder.bind(PREFIX + "links.operator", String.class).orElse("/support/operator/requests/{id}"),
      binder.bind(PREFIX + "links.answer", String.class).orElse("/support/answer?token={token}"),
      duration(binder, "answer-link.ttl", Duration.ofDays(7)),
      duration(binder, "retention.attachments", Duration.ofDays(365)),
      duration(binder, "retention.journal", Duration.ofDays(365)),
      duration(binder, "retention.guest-email", Duration.ofDays(365))
    );
  }

  // REQ-SUPPORT-010
  private static Duration duration(Binder binder, String key, Duration fallback) {
    Duration value = binder.bind(PREFIX + key, Duration.class).orElse(fallback);
    if (value.isNegative() || value.isZero()) {
      throw refused(key, value + ": срок должен быть положительным — бессрочного хранения нет");
    }
    return value;
  }

  private static IllegalStateException refused(String key, String reason) {
    return new IllegalStateException("Настройка " + PREFIX + key + ": " + reason);
  }

  URI request(UUID id) {
    return linkBase.resolve(requestLink.replace("{id}", id.toString()));
  }

  URI operator(UUID id) {
    return linkBase.resolve(operatorLink.replace("{id}", id.toString()));
  }

  URI answer(String token) {
    return linkBase.resolve(answerLink.replace("{token}", token));
  }
}
