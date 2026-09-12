package io.github.apocarteres.platform.persistence.internal;

import io.github.apocarteres.platform.persistence.SqlCommandWriter;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.RecordComponent;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoField;
import java.time.temporal.Temporal;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;

// REQ-PERSISTENCE-009, REQ-PERSISTENCE-010, ADR-0002
public final class JsonSqlCommandWriter implements SqlCommandWriter {

  @Override
  public String write(Object command) {
    StringBuilder json = new StringBuilder();
    append(json, command, command);
    return json.toString();
  }

  private void append(StringBuilder json, Object value, Object command) {
    switch (value) {
      case null -> json.append("null");
      case CharSequence text -> quote(json, text);
      case Character symbol -> quote(json, String.valueOf(symbol));
      case Boolean flag -> json.append(flag);
      case Number number -> json.append(number);
      // REQ-PERSISTENCE-009
      case Temporal moment -> quote(json, moment(moment));
      case UUID id -> quote(json, id.toString());
      case Enum<?> constant -> quote(json, constant.name());
      case Collection<?> items -> appendArray(json, items, command);
      case Map<?, ?> entries -> appendMap(json, entries, command);
      case Object record when record.getClass().isRecord() -> appendRecord(json, record, command);
      default -> throw refusal(command, value);
    }
  }

  // REQ-PERSISTENCE-009
  private static final DateTimeFormatter WITH_OFFSET = new DateTimeFormatterBuilder()
    .appendPattern("uuuu-MM-dd'T'HH:mm:ss")
    .appendFraction(ChronoField.NANO_OF_SECOND, 0, 9, true)
    .appendOffsetId()
    .toFormatter();

  private static final DateTimeFormatter WITHOUT_OFFSET = new DateTimeFormatterBuilder()
    .appendPattern("uuuu-MM-dd'T'HH:mm:ss")
    .appendFraction(ChronoField.NANO_OF_SECOND, 0, 9, true)
    .toFormatter();

  // REQ-PERSISTENCE-009
  private static String moment(Temporal moment) {
    return switch (moment) {
      case OffsetDateTime at -> WITH_OFFSET.format(at);
      case ZonedDateTime at -> WITH_OFFSET.format(at);
      case LocalDateTime at -> WITHOUT_OFFSET.format(at);
      default -> moment.toString();
    };
  }

  private void appendArray(StringBuilder json, Collection<?> items, Object command) {
    json.append('[');
    boolean first = true;
    for (Object item : items) {
      if (!first) {
        json.append(',');
      }
      first = false;
      append(json, item, command);
    }
    json.append(']');
  }

  private void appendMap(StringBuilder json, Map<?, ?> entries, Object command) {
    json.append('{');
    boolean first = true;
    for (Map.Entry<?, ?> entry : entries.entrySet()) {
      if (entry.getKey() == null || !(entry.getKey() instanceof CharSequence name)) {
        throw refusal(command, entry.getKey());
      }
      if (!first) {
        json.append(',');
      }
      first = false;
      quote(json, name);
      json.append(':');
      append(json, entry.getValue(), command);
    }
    json.append('}');
  }

  private void appendRecord(StringBuilder json, Object record, Object command) {
    json.append('{');
    RecordComponent[] components = record.getClass().getRecordComponents();
    for (int index = 0; index < components.length; index += 1) {
      if (index > 0) {
        json.append(',');
      }
      quote(json, components[index].getName());
      json.append(':');
      append(json, valueOf(components[index], record, command), command);
    }
    json.append('}');
  }

  private static Object valueOf(RecordComponent component, Object record, Object command) {
    try {
      return component.getAccessor().invoke(record);
    } catch (IllegalAccessException | InvocationTargetException failure) {
      throw new IllegalArgumentException(
        "Cannot read DAO command " + command.getClass().getSimpleName() + ", field " + component.getName(), failure);
    }
  }

  // REQ-PERSISTENCE-010
  private static IllegalArgumentException refusal(Object command, Object value) {
    String type = value == null ? "null" : value.getClass().getName();
    return new IllegalArgumentException(
      "Cannot serialize DAO command " + command.getClass().getSimpleName() + ": unsupported value of type " + type);
  }

  private static void quote(StringBuilder json, CharSequence text) {
    json.append('"');
    for (int index = 0; index < text.length(); index += 1) {
      char symbol = text.charAt(index);
      switch (symbol) {
        case '"' -> json.append("\\\"");
        case '\\' -> json.append("\\\\");
        case '\n' -> json.append("\\n");
        case '\r' -> json.append("\\r");
        case '\t' -> json.append("\\t");
        case '\b' -> json.append("\\b");
        case '\f' -> json.append("\\f");
        default -> {
          if (symbol < 0x20) {
            json.append(String.format("\\u%04x", (int) symbol));
          } else {
            json.append(symbol);
          }
        }
      }
    }
    json.append('"');
  }
}
