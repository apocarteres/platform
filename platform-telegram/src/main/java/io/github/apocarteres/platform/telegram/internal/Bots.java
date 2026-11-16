package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.telegram.TelegramBot;
import io.github.apocarteres.platform.telegram.TelegramBots;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

// REQ-TELEGRAM-002, REQ-TELEGRAM-011
final class Bots implements TelegramBots {

  private final Map<String, BotClient> clients;

  Bots(TelegramSettings settings) {
    HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    Map<String, BotClient> made = new TreeMap<>();
    settings.bots().forEach((id, bot) -> made.put(id, new BotClient(bot, settings.apiBase(), http)));
    this.clients = java.util.Collections.unmodifiableMap(made);
  }

  @Override
  public Set<String> ids() {
    return java.util.Collections.unmodifiableSet(new java.util.TreeSet<>(clients.keySet()));
  }

  @Override
  public TelegramBot bot(String id) {
    return client(id);
  }

  BotClient client(String id) {
    BotClient client = id == null ? null : clients.get(id);
    if (client == null) {
      throw new IllegalArgumentException("Бот «" + id + "» не объявлен в platform.telegram.bots");
    }
    return client;
  }
}
