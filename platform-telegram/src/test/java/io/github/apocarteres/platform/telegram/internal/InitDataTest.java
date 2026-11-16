package io.github.apocarteres.platform.telegram.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

// REQ-TELEGRAM-018
class InitDataTest {

  static final String TOKEN = "123456:" + "t".repeat(35);
  static final Instant NOW = Instant.parse("2026-11-16T10:00:00Z");
  static final String USER = "{\"id\":7001,\"first_name\":\"Имя\",\"username\":\"player\",\"language_code\":\"ru\"}";

  // REQ-TELEGRAM-018
  static String signed(String token, Map<String, String> fields) {
    try {
      Mac first = Mac.getInstance("HmacSHA256");
      first.init(new SecretKeySpec("WebAppData".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      byte[] secret = first.doFinal(token.getBytes(StandardCharsets.UTF_8));
      String check = new TreeMap<>(fields).entrySet().stream().map(one -> one.getKey() + "=" + one.getValue())
        .collect(Collectors.joining("\n"));
      Mac second = Mac.getInstance("HmacSHA256");
      second.init(new SecretKeySpec(secret, "HmacSHA256"));
      String hash = HexFormat.of().formatHex(second.doFinal(check.getBytes(StandardCharsets.UTF_8)));
      Map<String, String> all = new LinkedHashMap<>(fields);
      all.put("hash", hash);
      return all.entrySet().stream().map(one -> one.getKey() + "=" + URLEncoder.encode(one.getValue(), StandardCharsets.UTF_8))
        .collect(Collectors.joining("&"));
    } catch (java.security.GeneralSecurityException impossible) {
      throw new IllegalStateException(impossible);
    }
  }

  static Map<String, String> fields(Instant authDate) {
    Map<String, String> fields = new LinkedHashMap<>();
    fields.put("query_id", "AAE");
    fields.put("user", USER);
    fields.put("auth_date", Long.toString(authDate.getEpochSecond()));
    fields.put("signature", "c2lnbmF0dXJl");
    return fields;
  }

  private static boolean accepted(String raw) {
    return InitData.verify(raw, TOKEN, NOW, Duration.ofHours(1)).isPresent();
  }

  @Test
  @DisplayName("Верная initData: пользователь из поля user; подпись проверена ключом из токена бота")
  void acceptsSigned() {
    assertThat(InitData.verify(signed(TOKEN, fields(NOW.minusSeconds(60))), TOKEN, NOW, Duration.ofHours(1)))
      .hasValue(new InitData.User(7001L, "Имя", null, "player", "ru"));
  }

  @Test
  @DisplayName("Подделка, чужой бот, срок, будущее время, повтор поля и неполнота — отказ")
  void refusesTheRest() {
    String valid = signed(TOKEN, fields(NOW.minusSeconds(60)));
    assertThat(accepted(valid.replace("query_id=AAE", "query_id=AAF"))).isFalse();
    assertThat(accepted(signed("654321:" + "u".repeat(35), fields(NOW.minusSeconds(60))))).isFalse();
    assertThat(accepted(signed(TOKEN, fields(NOW.minus(Duration.ofHours(1)).minusSeconds(1))))).isFalse();
    assertThat(accepted(signed(TOKEN, fields(NOW.plus(Duration.ofMinutes(2)))))).isFalse();
    assertThat(accepted(valid + "&query_id=AAE")).isFalse();
    Map<String, String> noUser = fields(NOW);
    noUser.remove("user");
    assertThat(accepted(signed(TOKEN, noUser))).isFalse();
    Map<String, String> anonymous = fields(NOW);
    anonymous.put("user", "{\"first_name\":\"Имя\"}");
    assertThat(accepted(signed(TOKEN, anonymous))).isFalse();
    assertThat(accepted(valid.replaceAll("hash=[0-9a-f]+", "hash=XYZ"))).isFalse();
    assertThat(accepted(null)).isFalse();
    assertThat(accepted("")).isFalse();
    assertThat(accepted("x".repeat(InitData.LONGEST + 1))).isFalse();
  }
}
