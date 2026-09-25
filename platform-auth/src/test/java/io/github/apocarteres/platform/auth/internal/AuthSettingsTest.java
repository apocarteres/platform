package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

// REQ-AUTH-010
class AuthSettingsTest {

  private static MockEnvironment linkedTo(String base, String... profiles) {
    MockEnvironment environment = new MockEnvironment()
      .withProperty("platform.auth.roles", "USER")
      .withProperty("platform.auth.default-roles", "USER")
      .withProperty("platform.auth.link-base", base);
    environment.setActiveProfiles(profiles);
    return environment;
  }

  @Test
  @DisplayName("Ссылки писем: https везде, http на localhost, http стенда — вне профиля production")
  void httpLinksAreForStands() {
    assertThat(AuthSettings.of(linkedTo("https://site.example", "production")).linkBase()).isEqualTo(URI.create("https://site.example"));
    assertThat(AuthSettings.of(linkedTo("http://localhost:4200")).linkBase().getHost()).isEqualTo("localhost");
    assertThat(AuthSettings.of(linkedTo("http://qa.shop.local:4202", "qa")).linkBase())
      .isEqualTo(URI.create("http://qa.shop.local:4202"));
    assertThatThrownBy(() -> AuthSettings.of(linkedTo("http://qa.shop.local:4202", "production")))
      .hasMessageContaining("platform.auth.link-base").hasMessageContaining("production");
    assertThatThrownBy(() -> AuthSettings.of(linkedTo("ftp://site.example"))).hasMessageContaining("https");
  }
}
