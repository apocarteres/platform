package io.github.apocarteres.platform.api.version;

import java.util.Optional;
import java.util.regex.Pattern;

// REQ-CLIENT-UPDATE-007
public record ApiVersion(int value) {

  // REQ-CLIENT-UPDATE-006
  public static final String HEADER = "X-Api-Version";

  private static final int HIGHEST = 999_999_999;

  private static final Pattern FORM = Pattern.compile("[1-9][0-9]{0,8}");

  public ApiVersion {
    if (value < 1 || value > HIGHEST) {
      throw new IllegalArgumentException("Версия API " + value + " недопустима: целое число от 1 до " + HIGHEST);
    }
  }

  public static Optional<ApiVersion> parse(String text) {
    if (text == null || !FORM.matcher(text).matches()) {
      return Optional.empty();
    }
    return Optional.of(new ApiVersion(Integer.parseInt(text)));
  }

  public boolean accepts(ApiVersion client) {
    return client.value >= value;
  }
}
