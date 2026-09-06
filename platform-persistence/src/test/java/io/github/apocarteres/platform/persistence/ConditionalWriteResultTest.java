package io.github.apocarteres.platform.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ConditionalWriteResultTest {

  @Test
  @DisplayName("required возвращает состояние применённой записи")
  void requiredReturnsAppliedValue() {
    ConditionalWriteResult<String> result = new ConditionalWriteResult.Applied<>("state");
    assertThat(result.required("unused")).isEqualTo("state");
  }

  @Test
  @DisplayName("required отказывает на любом неприменённом исходе сообщением вызывающего")
  void requiredFailsForOtherOutcomes() {
    for (ConditionalWriteResult<String> result : List.<ConditionalWriteResult<String>>of(
        new ConditionalWriteResult.Missing<>(),
        new ConditionalWriteResult.Conflict<>(3, "closed"),
        new ConditionalWriteResult.Rejected<>(3, "closed"))) {
      assertThatThrownBy(() -> result.required("invariant broken"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("invariant broken");
    }
  }

  @Test
  @DisplayName("Applied без значения — ошибка программиста")
  void appliedRequiresValue() {
    assertThatThrownBy(() -> new ConditionalWriteResult.Applied<>(null))
      .isInstanceOf(IllegalArgumentException.class);
  }
}
