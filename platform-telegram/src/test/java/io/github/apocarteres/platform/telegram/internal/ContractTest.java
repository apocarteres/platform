package io.github.apocarteres.platform.telegram.internal;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.apocarteres.platform.telegram.TelegramRefused;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-TELEGRAM-012
class ContractTest {

  private static final Map<String, Class<?>> SCHEMAS = Map.of(
    "Links", TelegramViews.Links.class,
    "BotLink", TelegramViews.BotLink.class,
    "Invitation", TelegramViews.Invitation.class
  );

  // REQ-AUTH-022, REQ-AUTH-038
  private static final Map<String, Integer> CHAIN = Map.of(
    "authentication-required", 401,
    "csrf-rejected", 403,
    "identity-rejected", 401,
    "rate-limited", 429,
    "rate-limit-unavailable", 503
  );

  private final JsonNode contract = read();

  private static JsonNode read() {
    try (InputStream source = ContractTest.class.getResourceAsStream("/openapi/platform-telegram.openapi.json")) {
      return JsonMapper.builder().build().readTree(source);
    } catch (java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
  }

  private static String pathOf(String[] value, String[] path) {
    return value.length > 0 ? value[0] : path[0];
  }

  private static Map<String, Method> endpoints() {
    Map<String, Method> found = new HashMap<>();
    for (Class<?> controller : new Class<?>[] {LinkController.class, WebhookController.class}) {
      String base = controller.getAnnotation(RequestMapping.class).value()[0];
      for (Method method : controller.getDeclaredMethods()) {
        PostMapping post = method.getAnnotation(PostMapping.class);
        GetMapping get = method.getAnnotation(GetMapping.class);
        DeleteMapping delete = method.getAnnotation(DeleteMapping.class);
        if (post != null) found.put("post " + base + pathOf(post.value(), post.path()), method);
        if (get != null) found.put("get " + base + pathOf(get.value(), get.path()), method);
        if (delete != null) found.put("delete " + base + pathOf(delete.value(), delete.path()), method);
      }
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
  @DisplayName("Каждая точка контроллеров описана в контракте, и каждая описанная точка есть в контроллере")
  void pathsMatch() {
    assertThat(described()).isEqualTo(new TreeSet<>(endpoints().keySet()));
  }

  @Test
  @DisplayName("Тело запроса есть у точки ровно тогда, когда оно описано в контракте")
  void requestBodiesMatch() {
    endpoints().forEach((key, method) -> {
      String[] parts = key.split(" ", 2);
      boolean described = contract.get("paths").get(parts[1]).get(parts[0]).get("requestBody") != null;
      boolean declared = Arrays.stream(method.getParameters()).anyMatch(one -> one.isAnnotationPresent(RequestBody.class));
      assertThat(declared).as(key).isEqualTo(described);
    });
  }

  @Test
  @DisplayName("Поля схем совпадают с полями записей ответов")
  void fieldsMatch() {
    JsonNode schemas = contract.get("components").get("schemas");
    SCHEMAS.forEach((name, type) -> {
      Set<String> described = new TreeSet<>(schemas.get(name).get("properties").propertyNames());
      Set<String> declared = Arrays.stream(type.getRecordComponents()).map(RecordComponent::getName)
        .collect(Collectors.toCollection(TreeSet::new));
      assertThat(described).as(name).isEqualTo(declared);
    });
  }

  @Test
  @DisplayName("Коды отказов контракта — ровно коды модуля и цепочки безопасности, и каждый стоит под своим статусом")
  void codesMatch() throws IllegalAccessException {
    Map<String, Integer> codes = new HashMap<>(CHAIN);
    for (Field field : TelegramRefused.class.getDeclaredFields()) {
      if (Modifier.isStatic(field.getModifiers()) && field.getType() == ErrorCode.class) {
        field.setAccessible(true);
        ErrorCode code = (ErrorCode) field.get(null);
        codes.put(code.value(), code.status().value());
      }
    }
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
