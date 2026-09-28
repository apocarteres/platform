package io.github.apocarteres.platform.notifications.internal;

import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.notifications.NotificationRefused;
import io.github.apocarteres.platform.notifications.internal.NotificationViews.Bell;
import io.github.apocarteres.platform.notifications.internal.NotificationViews.Page;
import io.github.apocarteres.platform.notifications.internal.NotificationViews.Unread;
import java.time.Clock;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// REQ-NOTIFICATIONS-004
@RestController
@RequestMapping("/api/notifications")
class NotificationController {

  private final NotificationStore store;
  private final NotificationSettings settings;
  private final Clock clock;

  NotificationController(NotificationStore store, NotificationSettings settings, Clock clock) {
    this.store = store;
    this.settings = settings;
    this.clock = clock;
  }

  @GetMapping("/unread")
  Unread unread() {
    return new Unread(store.unread(signedIn()));
  }

  @GetMapping("")
  Bell latest(@RequestParam(required = false) Integer limit) {
    UUID account = signedIn();
    int size = limit == null || limit < 1 ? settings.listSize() : Math.min(limit, NotificationSettings.LIST_MAX);
    return new Bell(store.latest(account, size), store.unread(account));
  }

  // REQ-NOTIFICATIONS-009
  @GetMapping("/page")
  Page page(@RequestParam(defaultValue = "0") int page, @RequestParam(required = false) Integer size,
    @RequestParam(defaultValue = "false") boolean unread) {
    int rows = size == null ? settings.listSize() : size;
    if (page < 0 || rows < 1 || rows > NotificationSettings.LIST_MAX) {
      throw new NotificationRefused(NotificationRefused.PAGE, "Страница — номер от 0, размер от 1 до " + NotificationSettings.LIST_MAX);
    }
    UUID account = signedIn();
    return new Page(store.page(account, unread, page, rows), store.count(account, unread), page, rows);
  }

  @PostMapping("/{id}/read")
  ResponseEntity<Void> read(@PathVariable UUID id) {
    if (!store.read(id, signedIn(), clock.instant())) {
      throw new NotificationRefused(NotificationRefused.NOT_FOUND, "Уведомления нет или оно чужое");
    }
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/read-all")
  ResponseEntity<Void> readAll() {
    store.readAll(signedIn(), clock.instant());
    return ResponseEntity.noContent().build();
  }

  private static UUID signedIn() {
    return CurrentAccount.id().orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Вход не выполнен"));
  }
}
