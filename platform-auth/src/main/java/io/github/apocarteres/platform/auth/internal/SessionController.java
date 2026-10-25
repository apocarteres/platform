package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.CurrentAccount;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// REQ-AUTH-047
@RestController
@RequestMapping("/api/auth")
class SessionController {

  record Opened(String id, boolean current, Instant signedInAt, Instant lastSeenAt, String address, String agent) {
  }

  private final Sessions sessions;

  SessionController(Sessions sessions) {
    this.sessions = sessions;
  }

  private static UUID me() {
    return CurrentAccount.id().orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Вход не выполнен"));
  }

  private static String current(HttpServletRequest request) {
    HttpSession session = request.getSession(false);
    return session == null ? null : session.getId();
  }

  @GetMapping("/sessions")
  List<Opened> list(HttpServletRequest request) {
    String current = current(request);
    return sessions.opened(me()).stream()
      .map(one -> new Opened(Sessions.handle(one.id()), one.id().equals(current), one.signedInAt(), one.lastSeenAt(), one.address(),
        one.agent()))
      .toList();
  }

  @DeleteMapping("/sessions/{id}")
  ResponseEntity<Void> end(@PathVariable String id) {
    sessions.endByHandle(me(), id);
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/sessions")
  ResponseEntity<Void> endOthers(HttpServletRequest request) {
    sessions.terminateExcept(me(), current(request));
    return ResponseEntity.noContent().build();
  }
}
