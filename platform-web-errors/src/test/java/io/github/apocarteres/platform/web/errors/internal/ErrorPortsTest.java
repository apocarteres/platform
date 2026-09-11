package io.github.apocarteres.platform.web.errors.internal;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.github.apocarteres.platform.web.errors.ErrorCodeResolver;
import io.github.apocarteres.platform.web.errors.ErrorExtensions;
import io.github.apocarteres.platform.web.errors.ErrorHeaders;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

// REQ-API-007, REQ-API-008
class ErrorPortsTest {

  private static final ErrorCode TOO_MANY = ErrorCode.of("rate-limited", HttpStatus.TOO_MANY_REQUESTS);

  private MockMvc mockMvc(ErrorExtensions extensions, ErrorHeaders headers) {
    return MockMvcBuilders.standaloneSetup(new Failing())
      .setControllerAdvice(new ApiErrorAdvice(
        failure -> Optional.of(TOO_MANY),
        new StatusErrorMessages(),
        Optional.ofNullable(extensions),
        Optional.ofNullable(headers),
        Optional.empty()
      ))
      .build();
  }

  @Test
  @DisplayName("Порт заголовков добавляет Retry-After к ответу об ошибке")
  void headersPortFills() throws Exception {
    mockMvc(null, (failure, code) -> {
      HttpHeaders headers = new HttpHeaders();
      headers.set(HttpHeaders.RETRY_AFTER, "30");
      return headers;
    })
      .perform(get("/limited"))
      .andExpect(status().isTooManyRequests())
      .andExpect(header().string(HttpHeaders.RETRY_AFTER, "30"))
      .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
      .andExpect(jsonPath("$.code").value("rate-limited"));
  }

  @Test
  @DisplayName("Заголовки исключения платформы приложений доходят без порта")
  void frameworkHeadersSurvive() throws Exception {
    mockMvc(null, null)
      .perform(get("/framework"))
      .andExpect(header().string("X-Limit", "reached"))
      .andExpect(jsonPath("$.code").value("rate-limited"));
  }

  @Test
  @DisplayName("Порт расширений добавляет собственные поля рядом с code")
  void extensionsPortFills() throws Exception {
    mockMvc((failure, code) -> Map.of("requestId", "r-42", "available", 3), null)
      .perform(get("/limited"))
      .andExpect(jsonPath("$.code").value("rate-limited"))
      .andExpect(jsonPath("$.requestId").value("r-42"))
      .andExpect(jsonPath("$.available").value(3));
  }

  @Test
  @DisplayName("Без объявленных портов ответ прежний: только обязательные поля и code")
  void withoutPorts() throws Exception {
    mockMvc(null, null)
      .perform(get("/limited"))
      .andExpect(jsonPath("$.code").value("rate-limited"))
      .andExpect(jsonPath("$.requestId").doesNotExist())
      .andExpect(header().doesNotExist(HttpHeaders.RETRY_AFTER));
  }

  @RestController
  static class Failing {

    @GetMapping("/limited")
    String limited() {
      throw new IllegalStateException("частота превышена");
    }

    @GetMapping("/framework")
    String framework() {
      HttpHeaders headers = new HttpHeaders();
      headers.set("X-Limit", "reached");
      throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "частота превышена") {
        @Override
        public HttpHeaders getHeaders() {
          return headers;
        }
      };
    }
  }
}
