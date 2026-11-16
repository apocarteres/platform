package io.github.apocarteres.platform.telegram;

// REQ-TELEGRAM-018, REQ-TELEGRAM-019
public record MiniAppUser(String bot, long id, String firstName, String lastName, String username, String language) {
}
