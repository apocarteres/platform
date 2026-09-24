package io.github.apocarteres.platform.support.internal;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.apocarteres.platform.ratelimit.RateLimitUnavailable;
import io.github.apocarteres.platform.ratelimit.RateLimited;
import io.github.apocarteres.platform.support.RequestState;
import io.github.apocarteres.platform.support.SupportRefused;
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
import org.springframework.web.bind.annotation.RequestPart;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-SUPPORT-013
class ContractTest {

  private static final Map<String, Class<?>> SCHEMAS = Map.ofEntries(
    Map.entry("Submission", SupportViews.Submission.class),
    Map.entry("Snapshot", Snapshot.class),
    Map.entry("JournalEntry", JournalEntry.class),
    Map.entry("Submitted", SupportViews.Submitted.class),
    Map.entry("Message", SupportViews.Message.class),
    Map.entry("StateChange", SupportViews.StateChange.class),
    Map.entry("AnswerLink", SupportViews.AnswerLink.class),
    Map.entry("Item", SupportViews.Item.class),
    Map.entry("Page", SupportViews.Page.class),
    Map.entry("Step", SupportViews.Step.class),
    Map.entry("OperatorStep", SupportViews.OperatorStep.class),
    Map.entry("File", SupportViews.File.class),
    Map.entry("AuthorView", SupportViews.AuthorView.class),
    Map.entry("OperatorView", SupportViews.OperatorView.class),
    Map.entry("Unread", SupportViews.Unread.class),
    Map.entry("Policy", SupportViews.Policy.class)
  );

  // REQ-AUTH-022
  private static final Map<String, Integer> CHAIN = Map.of(
    "authentication-required", 401,
    "csrf-rejected", 403,
    "access-denied", 403
  );

  private final JsonNode contract = read();

  private static JsonNode read() {
    try (InputStream source = ContractTest.class.getResourceAsStream("/openapi/platform-support.openapi.json")) {
      return JsonMapper.builder().build().readTree(source);
    } catch (java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
  }

  private static String pathOf(String[] value, String[] path) {
    return value.length > 0 ? value[0] : path[0];
  }

  private static Map<String, Method> endpoints() {
    String base = SupportController.class.getAnnotation(RequestMapping.class).value()[0];
    Map<String, Method> found = new HashMap<>();
    for (Method method : SupportController.class.getDeclaredMethods()) {
      PostMapping post = method.getAnnotation(PostMapping.class);
      GetMapping get = method.getAnnotation(GetMapping.class);
      if (post != null) found.put("post " + base + pathOf(post.value(), post.path()), method);
      if (get != null) found.put("get " + base + pathOf(get.value(), get.path()), method);
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
  @DisplayName("Тело запроса точки — та схема, которую описывает контракт, в том числе часть request обращения")
  void requestBodiesMatch() {
    endpoints().forEach((key, method) -> {
      String[] parts = key.split(" ", 2);
      JsonNode body = contract.get("paths").get(parts[1]).get(parts[0]).get("requestBody");
      Class<?> json = Arrays.stream(method.getParameters()).filter(one -> one.isAnnotationPresent(RequestBody.class))
        .map(one -> (Class<?>) one.getType()).findFirst().orElse(null);
      Class<?> part = Arrays.stream(method.getParameters())
        .filter(one -> one.isAnnotationPresent(RequestPart.class) && "request".equals(one.getAnnotation(RequestPart.class).value()))
        .map(one -> (Class<?>) one.getType()).findFirst().orElse(null);
      if (json == null && part == null) {
        assertThat(body).as(key).isNull();
        return;
      }
      String ref = json != null
        ? body.get("content").get("application/json").get("schema").get("$ref").asString()
        : body.get("content").get("multipart/form-data").get("schema").get("properties").get("request").get("$ref").asString();
      assertThat(SCHEMAS.get(ref.substring(ref.lastIndexOf('/') + 1))).as(key).isEqualTo(json != null ? json : part);
    });
  }

  @Test
  @DisplayName("Поля схем совпадают с полями записей запросов и ответов")
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
  @DisplayName("Состояния контракта — ровно состояния обращения")
  void statesMatch() {
    Set<String> described = new TreeSet<>();
    contract.get("components").get("schemas").get("RequestState").get("enum").forEach(value -> described.add(value.asString()));
    assertThat(described).isEqualTo(Arrays.stream(RequestState.values()).map(Enum::name).collect(Collectors.toCollection(TreeSet::new)));
  }

  @Test
  @DisplayName("Коды отказов контракта — ровно коды центра и цепочки безопасности, и каждый стоит под своим статусом")
  void codesMatch() throws IllegalAccessException {
    Map<String, Integer> codes = new HashMap<>(CHAIN);
    for (Class<?> owner : new Class<?>[] {SupportRefused.class, RateLimited.class, RateLimitUnavailable.class}) {
      for (Field field : owner.getDeclaredFields()) {
        if (Modifier.isStatic(field.getModifiers()) && field.getType() == ErrorCode.class) {
          field.setAccessible(true);
          ErrorCode code = (ErrorCode) field.get(null);
          codes.put(code.value(), code.status().value());
        }
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
