package io.github.apocarteres.platform.telegram.internal;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.OptionalLong;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import tools.jackson.databind.JsonNode;

// REQ-TELEGRAM-020
final class LoginData {

  static final int FIELDS = 16;
  static final int VALUE_CHARS = 1024;

  private static final Pattern HASH = Pattern.compile("[0-9a-f]{64}");
  private static final Pattern ID = Pattern.compile("[1-9][0-9]{0,18}");

  private LoginData() {
  }

  // REQ-TELEGRAM-020
  static OptionalLong verify(JsonNode body, String botToken, Instant now, Duration maxAge) {
    if (body == null || !body.isObject() || body.size() > FIELDS) {
      return OptionalLong.empty();
    }
    Map<String, String> fields = new TreeMap<>();
    for (Map.Entry<String, JsonNode> field : body.properties()) {
      JsonNode value = field.getValue();
      if (!value.isString() && !value.isIntegralNumber()) {
        return OptionalLong.empty();
      }
      String text = value.isString() ? value.asString() : value.bigIntegerValue().toString();
      if (text.length() > VALUE_CHARS) {
        return OptionalLong.empty();
      }
      fields.put(field.getKey(), text);
    }
    String hash = fields.remove("hash");
    String id = fields.get("id");
    String date = fields.get("auth_date");
    if (hash == null || !HASH.matcher(hash).matches() || id == null || !ID.matcher(id).matches() || date == null) {
      return OptionalLong.empty();
    }
    String checked = fields.entrySet().stream().map(entry -> entry.getKey() + "=" + entry.getValue()).collect(Collectors.joining("\n"));
    byte[] expected = HexFormat.of().formatHex(hmac(sha256(botToken), checked.getBytes(StandardCharsets.UTF_8)))
      .getBytes(StandardCharsets.US_ASCII);
    if (!MessageDigest.isEqual(expected, hash.getBytes(StandardCharsets.US_ASCII))) {
      return OptionalLong.empty();
    }
    Instant signed;
    try {
      signed = Instant.ofEpochSecond(Long.parseLong(date));
    } catch (NumberFormatException | java.time.DateTimeException malformed) {
      return OptionalLong.empty();
    }
    if (signed.isAfter(now.plus(InitData.SKEW)) || signed.isBefore(now.minus(maxAge))) {
      return OptionalLong.empty();
    }
    return OptionalLong.of(Long.parseLong(id));
  }

  private static byte[] sha256(String token) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }

  private static byte[] hmac(byte[] key, byte[] data) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key, "HmacSHA256"));
      return mac.doFinal(data);
    } catch (NoSuchAlgorithmException | InvalidKeyException impossible) {
      throw new IllegalStateException(impossible);
    }
  }
}
