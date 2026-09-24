package io.github.apocarteres.platform.api.version.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.api.version.ApiVersion;
import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.github.apocarteres.platform.web.errors.ErrorCodeResolver;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;

// REQ-CLIENT-UPDATE-006
@SpringBootTest(
  classes = ApiVersionCheckTest.Service.class,
  properties = {
    "platform.api.min-supported-version=3",
    "platform.api.version-exempt-paths=/hooks/**",
  }
)
class ApiVersionCheckTest {

  @Autowired
  private WebApplicationContext context;

  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    mvc = MockMvcBuilders.webAppContextSetup(context).build();
  }

  @Test
  @DisplayName("Клиент с минимальной и старшей версией проходит")
  void currentClientPasses() throws Exception {
    mvc.perform(get("/api/things").header(ApiVersion.HEADER, "3")).andExpect(status().isOk());
    mvc.perform(get("/api/things").header(ApiVersion.HEADER, "4")).andExpect(status().isOk());
  }

  @Test
  @DisplayName("Младшая версия получает ошибку ядра client-outdated, даже когда порт потребителя сопоставляет всё")
  void olderClientIsRefused() throws Exception {
    mvc.perform(get("/api/things").header(ApiVersion.HEADER, "2"))
      .andExpect(status().isUpgradeRequired())
      .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
      .andExpect(jsonPath("$.status").value(426))
      .andExpect(jsonPath("$.code").value("client-outdated"));
  }

  @Test
  @DisplayName("Запрос без заголовка или с неразборчивым заголовком отказывает так же")
  void unversionedClientIsRefused() throws Exception {
    mvc.perform(get("/api/things")).andExpect(jsonPath("$.code").value("client-outdated"));
    mvc.perform(get("/api/things").header(ApiVersion.HEADER, "03")).andExpect(jsonPath("$.code").value("client-outdated"));
  }

  @Test
  @DisplayName("Объявленные пути освобождены от проверки")
  void exemptPathsPass() throws Exception {
    mvc.perform(get("/hooks/payment")).andExpect(status().isOk());
  }

  @Test
  @DisplayName("Код отказа совпадает с тем, что разбирает клиент")
  void codeIsTheClientOne() {
    assertThat(ClientOutdated.CODE.value()).isEqualTo("client-outdated");
    assertThat(ClientOutdated.CODE.status()).isEqualTo(HttpStatus.UPGRADE_REQUIRED);
  }

  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration
  static class Service {

    @Bean
    ErrorCodeResolver everything() {
      return failure -> Optional.of(ErrorCode.of("anything", HttpStatus.BAD_REQUEST));
    }

    @Bean
    Things things() {
      return new Things();
    }
  }

  @RestController
  static class Things {

    @GetMapping("/api/things")
    String things() {
      return "[]";
    }

    @GetMapping("/hooks/payment")
    String hook() {
      return "принято";
    }
  }
}
