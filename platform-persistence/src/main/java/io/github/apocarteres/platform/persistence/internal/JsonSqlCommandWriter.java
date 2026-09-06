package io.github.apocarteres.platform.persistence.internal;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.github.apocarteres.platform.persistence.SqlCommandWriter;

// REQ-PERSISTENCE-009, ADR-0002
public final class JsonSqlCommandWriter implements SqlCommandWriter {

  private final ObjectMapper json = new ObjectMapper()
    .registerModule(new JavaTimeModule())
    .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

  @Override
  public String write(Object command) {
    try {
      return json.writeValueAsString(command);
    } catch (JsonProcessingException exception) {
      throw new IllegalArgumentException(
        "Cannot serialize DAO command " + command.getClass().getSimpleName(), exception);
    }
  }
}
