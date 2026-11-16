package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.telegram.TelegramReplies;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

// REQ-TELEGRAM-003, REQ-TELEGRAM-004, REQ-TELEGRAM-007, REQ-TELEGRAM-008
@RestController
@RequestMapping("/api/telegram")
class WebhookController {

  private static final String START = "/start ";

  private final LinkService links;
  private final TelegramReplies replies;

  WebhookController(LinkService links, TelegramReplies replies) {
    this.links = links;
    this.replies = replies;
  }

  // REQ-TELEGRAM-004
  @PostMapping("/webhook")
  ResponseEntity<Map<String, Object>> update(@RequestBody JsonNode update) {
    JsonNode message = update.path("message");
    JsonNode chat = message.path("chat");
    JsonNode from = message.path("from");
    JsonNode text = message.path("text");
    if (!"private".equals(chat.path("type").asString("")) || !chat.path("id").isIntegralNumber()
      || !from.path("id").isIntegralNumber() || !text.isString() || !text.asString().startsWith(START)) {
      return ResponseEntity.ok().build();
    }
    String token = text.asString().substring(START.length()).trim();
    long chatId = chat.path("id").asLong();
    String language = from.path("language_code").asString("");
    boolean linked = links.accept(token, from.path("id").asLong(), chatId);
    // REQ-TELEGRAM-008
    Optional<String> reply = linked ? replies.linked(language) : replies.refused(language);
    return reply.filter(one -> !one.isBlank()).map(one -> {
      Map<String, Object> send = new LinkedHashMap<>();
      send.put("method", "sendMessage");
      send.put("chat_id", chatId);
      send.put("text", one);
      return ResponseEntity.ok(send);
    }).orElseGet(() -> ResponseEntity.ok().build());
  }
}
