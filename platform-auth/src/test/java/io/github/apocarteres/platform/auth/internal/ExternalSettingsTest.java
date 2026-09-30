package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.apocarteres.platform.auth.ExternalIdentity;
import io.github.apocarteres.platform.auth.RequestAuthenticator;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

// REQ-AUTH-037, REQ-AUTH-038, REQ-AUTH-039
class ExternalSettingsTest {

  private static RequestAuthenticator covering(String... paths) {
    return new RequestAuthenticator() {
      @Override
      public Set<String> paths() {
        return Set.of(paths);
      }

      @Override
      public Optional<ExternalIdentity> authenticate(HttpServletRequest request) {
        return Optional.empty();
      }
    };
  }

  private static MockEnvironment roles(String account, String external) {
    return new MockEnvironment().withProperty("platform.auth.roles", account).withProperty("platform.auth.external.roles", external);
  }

  @Test
  @DisplayName("Роли внешней личности не пересекаются с ролями учётных записей; пути — под /api/**, но не /api/auth/**")
  void externalIdentityIsBounded() {
    ExternalSettings settings = ExternalSettings.of(roles("STAFF", "CLIENT"), List.of(covering("/api/telegram/**")));
    assertThat(settings.roles()).containsExactly("CLIENT");
    assertThat(settings.requestsPerMinute()).isEqualTo(120);

    assertThatThrownBy(() -> ExternalSettings.of(roles("STAFF,CLIENT", "CLIENT"), List.of(covering("/api/telegram/**"))))
      .hasMessageContaining("platform.auth.external.roles").hasMessageContaining("CLIENT");
    assertThatThrownBy(() -> ExternalSettings.of(roles("STAFF", "CLIENT"), List.of(covering("/api/auth/**"))))
      .hasMessageContaining("/api/auth/**");
    assertThatThrownBy(() -> ExternalSettings.of(roles("STAFF", "CLIENT"), List.of(covering("/api/**"))))
      .hasMessageContaining("/api/**");
    assertThatThrownBy(() -> ExternalSettings.of(roles("STAFF", "CLIENT"), List.of(covering("/webhook"))))
      .hasMessageContaining("/webhook");
    assertThatThrownBy(() -> ExternalSettings.of(roles("STAFF", "CLIENT").withProperty("platform.auth.external.requests-per-minute", "0"),
      List.of(covering("/api/telegram/**")))).hasMessageContaining("platform.auth.external.requests-per-minute");
  }
}
