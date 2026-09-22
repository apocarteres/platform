package io.github.apocarteres.platform.web.errors.internal;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.github.apocarteres.platform.web.errors.ErrorCodeResolver;
import io.github.apocarteres.platform.web.errors.ErrorMessages;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

// REQ-API-001, REQ-API-002, REQ-API-003
class ApiErrorAdviceTest {

  private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

  private MockMvc mockMvc(ErrorCodeResolver codes, ErrorMessages messages) {
    return MockMvcBuilders.standaloneSetup(new Failing())
      .setControllerAdvice(new ApiErrorAdvice(
        codes, messages, Optional.empty(), Optional.empty(), Optional.of(new ErrorMetrics(Optional.of(registry)))
      ))
      .build();
  }

  @Test
  @DisplayName("Код и статус берутся у порта потребителя, тело — ProblemDetail с расширением code")
  void bodyFollowsResolvedCode() throws Exception {
    mockMvc(failure -> Optional.of(ErrorCode.of("player-absent", HttpStatus.NOT_FOUND)), new StatusErrorMessages())
      .perform(get("/players/17"))
      .andExpect(status().isNotFound())
      .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
      .andExpect(jsonPath("$.status").value(404))
      .andExpect(jsonPath("$.title").value("Not Found"))
      .andExpect(jsonPath("$.detail").value("Not Found"))
      .andExpect(jsonPath("$.code").value("player-absent"))
      .andExpect(jsonPath("$.instance").value("/players/17"));
  }

  @Test
  @DisplayName("Неопознанное исключение отдаётся как 500 с кодом unexpected и не раскрывает сообщения")
  void unresolvedBecomesUnexpected() throws Exception {
    mockMvc(failure -> Optional.empty(), new StatusErrorMessages())
      .perform(get("/players/17"))
      .andExpect(status().isInternalServerError())
      .andExpect(jsonPath("$.code").value("unexpected"))
      .andExpect(jsonPath("$.detail").value("Internal Server Error"))
      .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("пароль"))));
  }

  @Test
  @DisplayName("Рамочное исключение сохраняет свой статус, а код выводится из него")
  void frameworkFailureKeepsItsStatus() throws Exception {
    mockMvc(failure -> Optional.empty(), new StatusErrorMessages())
      .perform(get("/rejected"))
      .andExpect(status().isBadRequest())
      .andExpect(jsonPath("$.status").value(400))
      .andExpect(jsonPath("$.code").value("bad-request"));
  }

  @Test
  @DisplayName("Метрика ошибки считается по шаблону пути, а не по конкретному адресу")
  void metricNormalisesUri() throws Exception {
    MockMvc mvc = mockMvc(failure -> Optional.of(ErrorCode.of("player-absent", HttpStatus.NOT_FOUND)), new StatusErrorMessages());
    mvc.perform(get("/players/17"));
    mvc.perform(get("/players/42"));

    Assertions.assertThat(registry.find("api.errors").tag("uri", "/players/{id}").counter())
      .isNotNull()
      .satisfies(counter -> Assertions.assertThat(counter.count()).isEqualTo(2));
  }

  @RestController
  static class Failing {

    @GetMapping("/players/{id}")
    String player(@PathVariable String id) {
      throw new NoSuchElementException("игрок " + id + " не найден, пароль администратора не подходит");
    }

    @GetMapping("/rejected")
    String rejected() {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "тело запроса не разобрано");
    }
  }

  // REQ-API-010
  private final ListAppender<ILoggingEvent> records = new ListAppender<>();

  // REQ-API-010
  @BeforeEach
  void listen() {
    records.start();
    ((ch.qos.logback.classic.Logger) LoggerFactory.getLogger(ApiErrorAdvice.class)).addAppender(records);
  }

  @AfterEach
  void stopListening() {
    ((ch.qos.logback.classic.Logger) LoggerFactory.getLogger(ApiErrorAdvice.class)).detachAppender(records);
    records.stop();
  }

  private List<ILoggingEvent> failures() {
    return records.list.stream().filter(event -> event.getLevel() == Level.ERROR).toList();
  }

  // REQ-API-010
  @Test
  @DisplayName("Отказ без объявленного кода сохраняется в журнале вместе с исключением")
  void keepsTheUnexplained() throws Exception {
    mockMvc(failure -> Optional.empty(), new StatusErrorMessages())
      .perform(get("/players/17"))
      .andExpect(status().isInternalServerError())
      .andExpect(jsonPath("$.code").value("unexpected"));

    Assertions.assertThat(failures()).hasSize(1);
    ILoggingEvent kept = failures().get(0);
    Assertions.assertThat(kept.getFormattedMessage())
      .contains("GET /players/17")
      .contains("500")
      .contains("unexpected");
    Assertions.assertThat(kept.getThrowableProxy()).isNotNull();
    Assertions.assertThat(kept.getThrowableProxy().getClassName()).isEqualTo(NoSuchElementException.class.getName());
    Assertions.assertThat(kept.getThrowableProxy().getMessage()).contains("пароль администратора");
  }

  // REQ-API-010
  @Test
  @DisplayName("Отказ с объявленным кодом и отказ клиента журнал не шевелят")
  void staysSilentOnDeclaredAndOnClientFailures() throws Exception {
    mockMvc(failure -> Optional.of(ErrorCode.of("player-not-found", HttpStatus.NOT_FOUND)), new StatusErrorMessages())
      .perform(get("/players/17"))
      .andExpect(status().isNotFound());
    Assertions.assertThat(failures()).isEmpty();

    mockMvc(failure -> Optional.of(ErrorCode.of("storage-down", HttpStatus.SERVICE_UNAVAILABLE)), new StatusErrorMessages())
      .perform(get("/players/17"))
      .andExpect(status().isServiceUnavailable());
    Assertions.assertThat(failures()).as("объявленный потребителем отказ службы молчалив").isEmpty();

    mockMvc(failure -> Optional.empty(), new StatusErrorMessages())
      .perform(get("/rejected"))
      .andExpect(status().isBadRequest());
    Assertions.assertThat(failures()).as("отказ клиента не есть отказ службы").isEmpty();
  }
}
