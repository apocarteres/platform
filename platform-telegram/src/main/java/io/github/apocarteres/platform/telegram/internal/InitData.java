package io.github.apocarteres.platform.telegram.internal;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-TELEGRAM-018
final class InitData {

  static final int LONGEST = 8192;
  static final Duration SKEW = Duration.ofMinutes(1);

  private static final Pattern HASH = Pattern.compile("[0-9a-f]{64}");
  private static final byte[] WEB_APP_DATA = "WebAppData".getBytes(StandardCharsets.UTF_8);
  private static final JsonMapper JSON = JsonMapper.builder().build();

  record User(long id, String firstName, String lastName, String username, String language) {
  }

  private InitData() {
  }

  // REQ-TELEGRAM-018
  static Optional<User> verify(String raw, String botToken, Instant now, Duration maxAge) {
    if (raw == null || raw.isEmpty() || raw.length() > LONGEST) {
      return Optional.empty();
    }
    Map<String, String> fields = new TreeMap<>();
    for (String pair : raw.split("&", -1)) {
      int split = pair.indexOf('=');
      if (split <= 0) {
        return Optional.empty();
      }
      String key;
      String value;
      try {
        key = URLDecoder.decode(pair.substring(0, split), StandardCharsets.UTF_8);
        value = URLDecoder.decode(pair.substring(split + 1), StandardCharsets.UTF_8);
      } catch (IllegalArgumentException malformed) {
        return Optional.empty();
      }
      if (fields.put(key, value) != null) {
        return Optional.empty();
      }
    }
    String hash = fields.remove("hash");
    if (hash == null || !HASH.matcher(hash).matches() || !fields.containsKey("auth_date") || !fields.containsKey("user")) {
      return Optional.empty();
    }
    String checked = fields.entrySet().stream().map(entry -> entry.getKey() + "=" + entry.getValue()).collect(Collectors.joining("\n"));
    byte[] expected = HexFormat.of().formatHex(hmac(hmac(WEB_APP_DATA, botToken.getBytes(StandardCharsets.UTF_8)),
      checked.getBytes(StandardCharsets.UTF_8))).getBytes(StandardCharsets.US_ASCII);
    if (!MessageDigest.isEqual(expected, hash.getBytes(StandardCharsets.US_ASCII))) {
      return Optional.empty();
    }
    Instant signed;
    try {
      signed = Instant.ofEpochSecond(Long.parseLong(fields.get("auth_date")));
    } catch (NumberFormatException | java.time.DateTimeException malformed) {
      return Optional.empty();
    }
    if (signed.isAfter(now.plus(SKEW)) || signed.isBefore(now.minus(maxAge))) {
      return Optional.empty();
    }
    return user(fields.get("user"));
  }

  private static Optional<User> user(String json) {
    JsonNode user;
    try {
      user = JSON.readTree(json);
    } catch (JacksonException unreadable) {
      return Optional.empty();
    }
    if (user == null || !user.path("id").isIntegralNumber()) {
      return Optional.empty();
    }
    return Optional.of(new User(user.path("id").asLong(), text(user, "first_name"), text(user, "last_name"), text(user, "username"),
      text(user, "language_code")));
  }

  private static String text(JsonNode node, String field) {
    JsonNode value = node.path(field);
    return value.isString() ? value.asString() : null;
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
