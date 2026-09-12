package io.github.apocarteres.platform.persistence.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.apocarteres.platform.persistence.SqlCommandWriter;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

// REQ-PERSISTENCE-009, REQ-PERSISTENCE-010
class JsonSqlCommandWriterTest {

  private static final UUID ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

  private final SqlCommandWriter writer = new JsonSqlCommandWriter();

  enum State { APPLIED }

  record Peer(String key, long weight) {
  }

  record Command(
    UUID id, String name, Long version, Boolean enabled, BigDecimal amount,
    State state, Instant observedAt, List<Peer> peers
  ) {
  }

  record Moment(OffsetDateTime at) {
  }

  record Holder(Object value) {
  }

  @Test
  @DisplayName("Команда записывается полями записи в порядке объявления")
  void writesRecordFieldsInOrder() {
    String json = writer.write(new Command(
      ID, "первый", 7L, true, new BigDecimal("10.50"), State.APPLIED,
      Instant.parse("2026-09-12T08:00:00Z"), List.of(new Peer("abc", 3))
    ));

    assertThat(json).isEqualTo("{\"id\":\"11111111-2222-3333-4444-555555555555\",\"name\":\"первый\","
      + "\"version\":7,\"enabled\":true,\"amount\":10.50,\"state\":\"APPLIED\","
      + "\"observedAt\":\"2026-09-12T08:00:00Z\",\"peers\":[{\"key\":\"abc\",\"weight\":3}]}");
  }

  // REQ-PERSISTENCE-009
  @Test
  @DisplayName("Дата записывается в ISO-8601, как прежде")
  void keepsTheFormatOfDates() {
    String json = writer.write(new Moment(OffsetDateTime.of(2026, 9, 6, 12, 0, 0, 0, ZoneOffset.UTC)));

    assertThat(json).isEqualTo("{\"at\":\"2026-09-06T12:00:00Z\"}");
  }

  @Test
  @DisplayName("Отсутствующее значение записывается как null")
  void writesAbsentValueAsNull() {
    assertThat(writer.write(new Holder(null))).isEqualTo("{\"value\":null}");
  }

  @Test
  @DisplayName("Кавычки, косые черты и управляющие знаки экранируются")
  void escapesQuotesAndControlCharacters() {
    String json = writer.write(new Holder("он сказал \"да\"\\нет\n\u0001"));

    assertThat(json).isEqualTo("{\"value\":\"он сказал \\\"да\\\"\\\\нет\\n\\u0001\"}");
  }

  @Test
  @DisplayName("Ключи отображения записываются как имена полей")
  void writesMapKeysAsFieldNames() {
    assertThat(writer.write(new Holder(Map.of("одно", 1)))).isEqualTo("{\"value\":{\"одно\":1}}");
  }

  // REQ-PERSISTENCE-010
  @Test
  @DisplayName("Неподдерживаемое значение отказывает с указанием команды и типа")
  void refusesAnUnsupportedValue() {
    assertThatThrownBy(() -> writer.write(new Holder(new Object())))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("Holder")
      .hasMessageContaining("java.lang.Object");
  }

  // REQ-PERSISTENCE-012
  @Test
  @DisplayName("Сериализация не требует чужой библиотеки на classpath")
  void needsNoForeignLibrary() {
    assertThat(getClass().getClassLoader().getResource("com/fasterxml/jackson/databind/ObjectMapper.class")).isNull();
    assertThat(writer.write(new Holder("значение"))).isEqualTo("{\"value\":\"значение\"}");
  }
}
