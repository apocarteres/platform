package io.github.apocarteres.platform.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SecretCipherTest {

  private static final String SECRET = "0123456789abcdef0123456789abcdef";
  private static final String RECORD = "profile-17";

  private final SecretCipher cipher = SecretCipher.of(SECRET);

  @Test
  @DisplayName("Зашифрованное расшифровывается тем же секретом и тем же идентификатором записи")
  void roundTrip() {
    String stored = cipher.encrypt("ключ доступа", RECORD);

    assertThat(cipher.decrypt(stored, RECORD)).isEqualTo("ключ доступа");
  }

  @Test
  @DisplayName("Повтор того же открытого текста даёт другой шифртекст")
  void repeatDiffers() {
    assertThat(cipher.encrypt("ключ доступа", RECORD))
      .isNotEqualTo(cipher.encrypt("ключ доступа", RECORD));
  }

  // REQ-SECRETS-003
  @Test
  @DisplayName("Расшифровка с чужим идентификатором записи отклоняется")
  void foreignRecordRejected() {
    String stored = cipher.encrypt("ключ доступа", RECORD);

    assertThatThrownBy(() -> cipher.decrypt(stored, "profile-18"))
      .isInstanceOf(SecretMismatchException.class);
  }

  @Test
  @DisplayName("Расшифровка чужим секретом отклоняется")
  void foreignSecretRejected() {
    String stored = cipher.encrypt("ключ доступа", RECORD);

    assertThatThrownBy(() -> SecretCipher.of("fedcba9876543210fedcba9876543210").decrypt(stored, RECORD))
      .isInstanceOf(SecretMismatchException.class);
  }

  @Test
  @DisplayName("Подмена шифртекста отклоняется")
  void tamperedRejected() {
    String stored = cipher.encrypt("ключ доступа", RECORD);
    String tampered = stored.substring(0, stored.length() - 2) + (stored.endsWith("A") ? "B" : "A");

    assertThatThrownBy(() -> cipher.decrypt(tampered, RECORD)).isInstanceOf(SecretMismatchException.class);
  }

  // REQ-SECRETS-002
  @Test
  @DisplayName("Слишком короткий секрет отклоняется при создании")
  void shortSecretRejected() {
    assertThatThrownBy(() -> SecretCipher.of("0123456789abcdef0123456789abcde"))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("32");
    assertThatThrownBy(() -> SecretCipher.of(null)).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  @DisplayName("Хранимое значение короче заголовка отклоняется названной ошибкой")
  void truncatedStoredRejected() {
    assertThatThrownBy(() -> cipher.decrypt("AAAA", RECORD))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("заголовка");
  }
}
