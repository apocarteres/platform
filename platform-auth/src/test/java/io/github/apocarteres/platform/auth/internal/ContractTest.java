package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.ratelimit.RateLimitUnavailable;
import io.github.apocarteres.platform.ratelimit.RateLimited;
import io.github.apocarteres.platform.web.errors.ErrorCode;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-AUTH-020
class ContractTest {

  private static final Map<String, Class<?>> SCHEMAS = Map.of(
    "RegisterRequest", AuthController.Registration.class,
    "LoginRequest", AuthController.Login.class,
    "EmailRequest", AuthController.Email.class,
    "TokenRequest", AuthController.Token.class,
    "ResetRequest", AuthController.Reset.class,
    "PasswordChangeRequest", AuthController.PasswordChange.class,
    "EmailChangeRequest", AuthController.EmailChange.class,
    "Account", AuthController.Me.class,
    "Csrf", AuthController.Csrf.class,
    "Policy", AuthController.Policy.class
  );

  private final JsonNode contract = read();

  private static JsonNode read() {
    try (InputStream source = ContractTest.class.getResourceAsStream("/openapi/platform-auth.openapi.json")) {
      return JsonMapper.builder().build().readTree(source);
    } catch (java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
  }

  private static Map<String, Method> endpoints() {
    String base = AuthController.class.getAnnotation(RequestMapping.class).value()[0];
    Map<String, Method> found = new HashMap<>();
    for (Method method : AuthController.class.getDeclaredMethods()) {
      PostMapping post = method.getAnnotation(PostMapping.class);
      GetMapping get = method.getAnnotation(GetMapping.class);
      if (post != null) found.put("post " + base + post.value()[0], method);
      if (get != null) found.put("get " + base + get.value()[0], method);
    }
    return found;
  }

  private Set<String> described() {
    Set<String> found = new TreeSet<>();
    contract.get("paths").properties().forEach(path -> path.getValue().properties()
      .forEach(operation -> found.add(operation.getKey() + " " + path.getKey())));
    return found;
  }

  @Test
  @DisplayName("Каждая точка контроллера описана в контракте, и каждая описанная точка есть в контроллере")
  void pathsMatch() {
    assertThat(described()).isEqualTo(new TreeSet<>(endpoints().keySet()));
  }

  @Test
  @DisplayName("Тело запроса точки — та схема, которую описывает контракт")
  void requestBodiesMatch() {
    endpoints().forEach((key, method) -> {
      String[] parts = key.split(" ", 2);
      JsonNode body = contract.get("paths").get(parts[1]).get(parts[0]).get("requestBody");
      Class<?> declared = Arrays.stream(method.getParameters()).filter(one -> one.isAnnotationPresent(RequestBody.class))
        .map(one -> (Class<?>) one.getType()).findFirst().orElse(null);
      if (declared == null) {
        assertThat(body).as(key).isNull();
        return;
      }
      String ref = body.get("content").get("application/json").get("schema").get("$ref").asString();
      assertThat(SCHEMAS.get(ref.substring(ref.lastIndexOf('/') + 1))).as(key).isEqualTo(declared);
    });
  }

  @Test
  @DisplayName("Поля схем совпадают с полями записей запросов и ответов")
  void fieldsMatch() {
    JsonNode schemas = contract.get("components").get("schemas");
    SCHEMAS.forEach((name, type) -> {
      Set<String> described = new TreeSet<>(schemas.get(name).get("properties").propertyNames());
      Set<String> declared = Arrays.stream(type.getRecordComponents()).map(RecordComponent::getName).collect(Collectors.toCollection(TreeSet::new));
      assertThat(described).as(name).isEqualTo(declared);
    });
  }

  @Test
  @DisplayName("Коды отказов контракта — ровно коды ядра, и каждый стоит под своим статусом")
  void codesMatch() throws IllegalAccessException {
    Map<String, Integer> codes = new HashMap<>();
    for (Class<?> owner : new Class<?>[] {AuthRefused.class, ProblemResponses.class, RateLimited.class, RateLimitUnavailable.class}) {
      for (Field field : owner.getDeclaredFields()) {
        if (Modifier.isStatic(field.getModifiers()) && field.getType() == ErrorCode.class) {
          field.setAccessible(true);
          ErrorCode code = (ErrorCode) field.get(null);
          codes.put(code.value(), code.status().value());
        }
      }
    }
    codes.remove("access-denied");
    Set<String> listed = new HashSet<>();
    contract.get("paths").properties().forEach(path -> path.getValue().properties().forEach(operation ->
      operation.getValue().get("responses").properties().forEach(response -> {
        JsonNode xCodes = response.getValue().get("x-codes");
        if (xCodes == null) {
          return;
        }
        for (JsonNode code : xCodes) {
          listed.add(code.asString());
          assertThat(codes.get(code.asString())).as(operation.getKey() + " " + path.getKey() + " " + code.asString())
            .isEqualTo(Integer.parseInt(response.getKey()));
        }
      })));
    assertThat(new TreeSet<>(listed)).isEqualTo(new TreeSet<>(codes.keySet()));
  }
}
