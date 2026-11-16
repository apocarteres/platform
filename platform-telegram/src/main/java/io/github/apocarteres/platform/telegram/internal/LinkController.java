package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.telegram.internal.TelegramViews.Invitation;
import io.github.apocarteres.platform.telegram.internal.TelegramViews.LinkState;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// REQ-TELEGRAM-006, REQ-TELEGRAM-009
@RestController
@RequestMapping("/api/telegram")
class LinkController {

  private final LinkService links;

  LinkController(LinkService links) {
    this.links = links;
  }

  @GetMapping("/link")
  LinkState state() {
    return links.state(signedIn());
  }

  @PostMapping("/link")
  Invitation invite() {
    return links.invite(signedIn());
  }

  @DeleteMapping("/link")
  ResponseEntity<Void> unlink() {
    links.unlink(signedIn());
    return ResponseEntity.noContent().build();
  }

  private static UUID signedIn() {
    return CurrentAccount.id().orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Вход не выполнен"));
  }
}
