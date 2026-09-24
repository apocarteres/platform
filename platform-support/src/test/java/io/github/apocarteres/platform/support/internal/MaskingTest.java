package io.github.apocarteres.platform.support.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-SUPPORT-006, REQ-CLIENT-JOURNAL-005
class MaskingTest {

  private final JsonNode vectors = JsonMapper.builder().build()
    .readTree(Path.of("..", "packages", "client-journal", "masking-vectors.json").toFile());

  @Test
  @DisplayName("Сервер маскирует по тем же общим примерам, что и журнал клиента")
  void masksLikeTheClient() {
    assertThat(Masking.MASK).isEqualTo(vectors.get("mask").asString());
    for (JsonNode vector : vectors.get("masked")) {
      assertThat(Masking.masked(vector.get("input").asString())).as(vector.get("input").asString())
        .isEqualTo(vector.get("output").asString());
    }
  }

  @Test
  @DisplayName("Сервер выделяет путь по тем же общим примерам, что и журнал клиента")
  void cutsPathsLikeTheClient() {
    for (JsonNode vector : vectors.get("paths")) {
      assertThat(Masking.barePath(vector.get("url").asString())).as(vector.get("url").asString())
        .isEqualTo(vector.get("path").asString());
    }
  }

  @Test
  @DisplayName("Текст длиннее предела обрезается до маскирования")
  void inputIsBounded() {
    String masked = Masking.masked("a ".repeat(Masking.INPUT_LIMIT) + "ivan@example.org");
    assertThat(masked).hasSize(Masking.INPUT_LIMIT).doesNotContain("@");
  }
}
