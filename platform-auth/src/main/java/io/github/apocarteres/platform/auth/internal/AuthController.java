package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.auth.EntryAccess;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// REQ-AUTH-003, REQ-AUTH-004, REQ-AUTH-005, REQ-AUTH-006, REQ-AUTH-008
@RestController
@RequestMapping("/api/auth")
class AuthController {

  record Registration(String email, String password, String human, Map<String, Object> profile) {
  }

  record Login(String email, String password, String human) {
  }

  record Email(String email, String human) {
  }

  record Token(String token) {
  }

  record Reset(String token, String password) {
  }

  record Me(UUID id, String email, Set<String> roles) {

    static Me of(Account account) {
      return new Me(account.id(), account.email(), account.roles());
    }
  }

  record Csrf(String headerName, String parameterName, String token) {
  }

  record PasswordChange(String current, String password) {
  }

  record Policy(int passwordMinBytes, int passwordMaxBytes) {
  }

  private final AuthService auth;
  private final Accounts accounts;
  private final SecurityContextRepository contexts;
  private final EntryAccess entry;
  private final AuthSettings settings;

  AuthController(AuthService auth, Accounts accounts, SecurityContextRepository contexts, EntryAccess entry, AuthSettings settings) {
    this.auth = auth;
    this.accounts = accounts;
    this.contexts = contexts;
    this.entry = entry;
    this.settings = settings;
  }

  // REQ-AUTH-016
  private void open(HttpServletRequest request) {
    if (!entry.allowed(request)) {
      throw new AuthRefused(AuthRefused.ENTRY, "Точки аутентификации для этого запроса закрыты проектом");
    }
  }

  @PostMapping("/register")
  ResponseEntity<Void> register(@RequestBody Registration body, HttpServletRequest request) {
    open(request);
    auth.register(body.email(), body.password(), body.human(), request.getRemoteAddr(), request.getLocale(), body.profile());
    return ResponseEntity.status(HttpStatus.ACCEPTED).build();
  }

  @PostMapping("/verify")
  ResponseEntity<Void> verify(@RequestBody Token body, HttpServletRequest request) {
    open(request);
    auth.verify(body.token(), request.getRemoteAddr());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/resend")
  ResponseEntity<Void> resend(@RequestBody Email body, HttpServletRequest request) {
    open(request);
    auth.resend(body.email(), request.getLocale());
    return ResponseEntity.status(HttpStatus.ACCEPTED).build();
  }

  // REQ-AUTH-005, REQ-AUTH-008
  @PostMapping("/login")
  Me login(@RequestBody Login body, HttpServletRequest request, HttpServletResponse response) {
    open(request);
    Account account = auth.authenticate(body.email(), body.password(), body.human(), request.getRemoteAddr());
    List<SimpleGrantedAuthority> authorities = account.roles().stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role)).toList();
    SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(account.id().toString(), null, authorities));
    request.getSession(true);
    request.changeSessionId();
    SecurityContextHolder.setContext(context);
    contexts.saveContext(context, request, response);
    return Me.of(account);
  }

  @PostMapping("/logout")
  ResponseEntity<Void> logout(HttpServletRequest request) {
    HttpSession session = request.getSession(false);
    if (session != null) {
      session.invalidate();
    }
    SecurityContextHolder.clearContext();
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/me")
  Me me() {
    UUID id = CurrentAccount.id().orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Вход не выполнен"));
    return accounts.find(id).map(Me::of).orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Учётной записи нет"));
  }

  // REQ-AUTH-008
  @GetMapping("/csrf")
  Csrf csrf(CsrfToken token) {
    return new Csrf(token.getHeaderName(), token.getParameterName(), token.getToken());
  }

  // REQ-AUTH-019
  @PostMapping("/password")
  ResponseEntity<Void> changePassword(@RequestBody PasswordChange body, HttpServletRequest request) {
    UUID id = CurrentAccount.id().orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Вход не выполнен"));
    HttpSession session = request.getSession(false);
    auth.changePassword(id, body.current(), body.password(), session == null ? null : session.getId());
    return ResponseEntity.noContent().build();
  }

  // REQ-AUTH-018
  @GetMapping("/policy")
  Policy policy() {
    return new Policy(settings.passwordMinBytes(), settings.passwordMaxBytes());
  }

  @PostMapping("/password-reset/request")
  ResponseEntity<Void> requestReset(@RequestBody Email body, HttpServletRequest request) {
    open(request);
    auth.requestReset(body.email(), body.human(), request.getRemoteAddr(), request.getLocale());
    return ResponseEntity.status(HttpStatus.ACCEPTED).build();
  }

  @PostMapping("/password-reset/confirm")
  ResponseEntity<Void> confirmReset(@RequestBody Reset body, HttpServletRequest request) {
    open(request);
    auth.confirmReset(body.token(), body.password(), request.getRemoteAddr());
    return ResponseEntity.noContent().build();
  }
}
