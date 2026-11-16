package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.auth.CurrentIdentity;
import io.github.apocarteres.platform.auth.ExternalIdentity;
import io.github.apocarteres.platform.telegram.TelegramRefused;
import io.github.apocarteres.platform.telegram.TelegramReplies;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
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
  private static final int LANGUAGE = 35;

  private final LinkService links;
  private final TelegramReplies replies;

  WebhookController(LinkService links, TelegramReplies replies) {
    this.links = links;
    this.replies = replies;
  }

  // REQ-TELEGRAM-004
  @PostMapping("/{bot}/webhook")
  ResponseEntity<Map<String, Object>> update(@PathVariable String bot, @RequestBody JsonNode update) {
    Optional<ExternalIdentity> identity = CurrentIdentity.get();
    if (identity.isEmpty() || !WebhookAuthenticator.KIND.equals(identity.get().kind()) || !identity.get().id().equals(bot)) {
      throw new TelegramRefused(TelegramRefused.BOT_NOT_FOUND, "Бот не объявлен");
    }
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
    language = language.length() > LANGUAGE ? "" : language;
    boolean linked = links.accept(bot, token, from.path("id").asLong(), chatId, language);
    // REQ-TELEGRAM-008
    Optional<String> reply = linked ? replies.linked(bot, language) : replies.refused(bot, language);
    return reply.filter(one -> !one.isBlank()).map(one -> {
      Map<String, Object> send = new LinkedHashMap<>();
      send.put("method", "sendMessage");
      send.put("chat_id", chatId);
      send.put("text", one);
      return ResponseEntity.ok(send);
    }).orElseGet(() -> ResponseEntity.ok().build());
  }
}
