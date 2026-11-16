package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.telegram.TelegramBot;
import io.github.apocarteres.platform.telegram.TelegramUnavailable;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// REQ-TELEGRAM-005, REQ-TELEGRAM-011
final class BotClient implements TelegramBot {

  private static final Duration TIMEOUT = Duration.ofSeconds(10);

  private final TelegramSettings settings;
  private final HttpClient http;
  private final JsonMapper json = JsonMapper.builder().build();

  BotClient(TelegramSettings settings, HttpClient http) {
    this.settings = settings;
    this.http = http;
  }

  @Override
  public void send(long chat, String text) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("chat_id", chat);
    body.put("text", text);
    call("sendMessage", body);
  }

  // REQ-TELEGRAM-005
  @Override
  public void useWebhook(URI url) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("url", url.toString());
    body.put("secret_token", settings.webhookSecret());
    body.put("allowed_updates", List.of("message"));
    call("setWebhook", body);
  }

  // REQ-TELEGRAM-011
  private void call(String method, Map<String, Object> body) {
    HttpRequest request = HttpRequest.newBuilder(settings.method(method)).timeout(TIMEOUT)
      .header("Content-Type", "application/json")
      .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
    HttpResponse<String> response;
    try {
      response = http.send(request, HttpResponse.BodyHandlers.ofString());
    } catch (IOException failure) {
      throw new TelegramUnavailable(method, "нет ответа (" + failure.getClass().getSimpleName() + ")");
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new TelegramUnavailable(method, "вызов прерван");
    }
    JsonNode answer;
    try {
      answer = json.readTree(response.body());
    } catch (JacksonException unreadable) {
      throw new TelegramUnavailable(method, "ответ " + response.statusCode() + " не JSON");
    }
    if (!answer.path("ok").asBoolean(false)) {
      throw new TelegramUnavailable(method, response.statusCode() + " " + answer.path("description").asString("без описания"));
    }
  }
}
