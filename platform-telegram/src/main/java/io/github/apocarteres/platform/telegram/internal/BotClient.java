package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.telegram.TelegramBot;
import io.github.apocarteres.platform.telegram.TelegramUnavailable;
import io.github.apocarteres.platform.telegram.internal.TelegramSettings.Bot;
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

// REQ-TELEGRAM-005, REQ-TELEGRAM-011, REQ-TELEGRAM-016
final class BotClient implements TelegramBot {

  private static final Duration TIMEOUT = Duration.ofSeconds(10);

  private final Bot bot;
  private final URI apiBase;
  private final HttpClient http;
  private final JsonMapper json = JsonMapper.builder().build();

  BotClient(Bot bot, URI apiBase, HttpClient http) {
    this.bot = bot;
    this.apiBase = apiBase;
    this.http = http;
  }

  // REQ-TELEGRAM-016
  record Answer(boolean ok, int code, String description, Duration retryAfter) {
  }

  @Override
  public void send(long chat, String text) {
    call("sendMessage", message(chat, text));
  }

  // REQ-TELEGRAM-016
  Answer sendMessage(long chat, String text) {
    return answer("sendMessage", message(chat, text));
  }

  private static Map<String, Object> message(long chat, String text) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("chat_id", chat);
    body.put("text", text);
    return body;
  }

  // REQ-TELEGRAM-005
  @Override
  public void useWebhook(URI url) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("url", url.toString());
    body.put("secret_token", bot.webhookSecret());
    body.put("allowed_updates", List.of("message"));
    call("setWebhook", body);
  }

  private void call(String method, Map<String, Object> body) {
    Answer answer = answer(method, body);
    if (!answer.ok()) {
      throw new TelegramUnavailable(method, answer.code() + " " + answer.description());
    }
  }

  // REQ-TELEGRAM-011
  private Answer answer(String method, Map<String, Object> body) {
    HttpRequest request = HttpRequest.newBuilder(bot.method(apiBase, method)).timeout(TIMEOUT)
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
    boolean ok = answer.path("ok").asBoolean(false);
    int code = answer.path("error_code").asInt(response.statusCode());
    JsonNode retry = answer.path("parameters").path("retry_after");
    return new Answer(ok, ok ? response.statusCode() : code, answer.path("description").asString("без описания"),
      retry.isIntegralNumber() ? Duration.ofSeconds(Math.max(1, retry.asLong())) : null);
  }
}
