package io.github.apocarteres.platform.api.version;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.InputStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-CLIENT-UPDATE-007
class ApiVersionTest {

  private final JsonNode vectors = read();

  private static JsonNode read() {
    try (InputStream source = ApiVersionTest.class.getResourceAsStream("/api-version-vectors.json")) {
      return JsonMapper.builder().build().readTree(source);
    } catch (java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
  }

  @Test
  @DisplayName("Имя заголовка совпадает с клиентом")
  void headerIsShared() {
    assertThat(ApiVersion.HEADER).isEqualTo(vectors.get("header").asString());
  }

  @Test
  @DisplayName("Допустимый заголовок читается той версией, которую записал клиент")
  void validHeadersParse() {
    for (JsonNode vector : vectors.get("valid")) {
      assertThat(ApiVersion.parse(vector.get("header").asString()))
        .as(vector.toString())
        .contains(new ApiVersion(vector.get("version").asInt()));
    }
  }

  @Test
  @DisplayName("Недопустимый заголовок не читается никакой версией")
  void invalidHeadersAreRefused() {
    for (JsonNode vector : vectors.get("invalidHeaders")) {
      assertThat(ApiVersion.parse(vector.asString())).as("«%s»", vector.asString()).isEmpty();
    }
    assertThat(ApiVersion.parse(null)).isEmpty();
  }

  @Test
  @DisplayName("Недопустимая версия не создаётся")
  void invalidVersionsAreRefused() {
    for (JsonNode vector : vectors.get("invalidVersions")) {
      if (!vector.canConvertToInt() || vector.isFloatingPointNumber()) {
        continue;
      }
      assertThatThrownBy(() -> new ApiVersion(vector.asInt())).as(vector.toString())
        .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  @DisplayName("Минимальная версия принимает равную и старшую, младшую отвергает")
  void comparisonFollowsVectors() {
    for (JsonNode vector : vectors.get("comparisons")) {
      ApiVersion minimum = new ApiVersion(vector.get("minimum").asInt());
      ApiVersion client = new ApiVersion(vector.get("client").asInt());
      assertThat(minimum.accepts(client)).as(vector.toString()).isEqualTo(vector.get("accepted").asBoolean());
    }
  }
}
