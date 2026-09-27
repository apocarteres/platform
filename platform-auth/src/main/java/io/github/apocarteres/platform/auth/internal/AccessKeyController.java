package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.AccessKey;
import io.github.apocarteres.platform.auth.AccessKeys;
import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.auth.IssuedKey;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// REQ-AUTH-029
@RestController
@RequestMapping("/api/auth")
class AccessKeyController {

  record KeyRequest(String name, int days) {
  }

  record Key(UUID id, String name, Instant createdAt, Instant expiresAt, Instant lastUsedAt) {

    static Key of(AccessKey key) {
      return new Key(key.id(), key.name(), key.createdAt(), key.expiresAt(), key.lastUsedAt());
    }
  }

  record Issued(UUID id, String name, Instant createdAt, Instant expiresAt, String value) {

    static Issued of(IssuedKey issued) {
      AccessKey key = issued.key();
      return new Issued(key.id(), key.name(), key.createdAt(), key.expiresAt(), issued.value());
    }

    @Override
    public String toString() {
      return "Issued[id=" + id + ", name=" + name + ", value=<скрыто>]";
    }
  }

  private final AccessKeys keys;

  AccessKeyController(AccessKeys keys) {
    this.keys = keys;
  }

  private static UUID me() {
    return CurrentAccount.id().orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Ключами управляет вошедший"));
  }

  @GetMapping("/keys")
  List<Key> list() {
    return keys.list(me()).stream().map(Key::of).toList();
  }

  @PostMapping("/keys")
  ResponseEntity<Issued> issue(@RequestBody KeyRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(Issued.of(keys.issue(me(), request.name(), request.days())));
  }

  @DeleteMapping("/keys/{id}")
  ResponseEntity<Void> revoke(@PathVariable UUID id) {
    keys.revoke(me(), id);
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/keys")
  ResponseEntity<Void> revokeAll() {
    keys.revokeAll(me());
    return ResponseEntity.noContent().build();
  }
}
