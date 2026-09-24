package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.NoProfile;
import io.github.apocarteres.platform.auth.RegistrationHook;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

// REQ-AUTH-021
class ProfileReaderTest {

  private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

  record Player(@NotBlank String name, Integer level) {
  }

  private final RegistrationHook<Player> players = new RegistrationHook<>() {
    @Override
    public Class<Player> profile() {
      return Player.class;
    }

    @Override
    public void registered(Account account, Player profile) {
    }
  };

  @Test
  @DisplayName("Словарь разбирается в класс проекта, чужое поле и неверное значение отвергаются с именем поля")
  void mapBecomesTheProjectClass() {
    ProfileReader reader = new ProfileReader(players, validator);
    assertThat(reader.read(Map.of("name", "Игрок", "level", 3))).isEqualTo(new Player("Игрок", 3));
    assertThatThrownBy(() -> reader.read(Map.of("name", "Игрок", "nickname", "x")))
      .isInstanceOfSatisfying(AuthRefused.class, refused -> assertThat(refused.code().value()).isEqualTo("profile-rejected"));
    assertThatThrownBy(() -> reader.read(Map.of("name", "Игрок", "level", "много"))).hasMessageContaining("не разобран в Player");
    assertThatThrownBy(() -> reader.read(Map.of("name", " "))).hasMessageContaining("проверку полей: name");
    assertThatThrownBy(() -> reader.read(null)).hasMessageContaining("name");
  }

  @Test
  @DisplayName("Экземпляр класса проверяется так же, экземпляр чужого класса — ошибка программиста")
  void instanceIsValidatedToo() {
    ProfileReader reader = new ProfileReader(players, validator);
    assertThat(reader.read(new Player("Игрок", null))).isEqualTo(new Player("Игрок", null));
    assertThatThrownBy(() -> reader.read(new Player("", null))).isInstanceOf(AuthRefused.class);
    assertThatThrownBy(() -> reader.read("строка")).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("хук ждёт");
  }

  @Test
  @DisplayName("Заглушка NONE объявляет пустой профиль: без полей проходит, любое поле — отказ")
  void noneAcceptsNothing() {
    ProfileReader reader = new ProfileReader(RegistrationHook.NONE, validator);
    assertThat(reader.read(null)).isEqualTo(new NoProfile());
    assertThat(reader.read(Map.of())).isEqualTo(new NoProfile());
    assertThatThrownBy(() -> reader.read(Map.of("name", "Игрок"))).isInstanceOf(AuthRefused.class);
  }
}
