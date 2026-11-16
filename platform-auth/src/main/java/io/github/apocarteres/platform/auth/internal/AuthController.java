package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.CurrentAccount;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// REQ-AUTH-003, REQ-AUTH-004, REQ-AUTH-005, REQ-AUTH-006, REQ-AUTH-008, REQ-AUTH-042, REQ-AUTH-043, REQ-AUTH-046, REQ-AUTH-047
@RestController
@RequestMapping("/api/auth")
class AuthController {

  // REQ-AUTH-042
  static final String SECOND_FACTOR = SessionSignIn.SECOND_FACTOR;

  record Registration(String email, String password, String human, Map<String, Object> profile) {
  }

  record Login(String email, String password, String human) {
  }

  // REQ-AUTH-043
  record SecondFactorCode(String code) {
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

  // REQ-AUTH-035
  record Session(Me account) {
  }

  record PasswordChange(String current, String password) {
  }

  // REQ-AUTH-023
  record EmailChange(String current, String email) {
  }

  record Policy(int passwordMinBytes, int passwordMaxBytes) {
  }

  private final AuthService auth;
  private final Accounts accounts;
  private final SessionSignIn sessions;
  private final AuthSettings settings;

  AuthController(AuthService auth, Accounts accounts, SessionSignIn sessions, AuthSettings settings) {
    this.auth = auth;
    this.accounts = accounts;
    this.sessions = sessions;
    this.settings = settings;
  }

  // REQ-AUTH-016
  private void open(HttpServletRequest request) {
    sessions.open(request);
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
    auth.resend(body.email(), body.human(), request.getRemoteAddr(), request.getLocale());
    return ResponseEntity.status(HttpStatus.ACCEPTED).build();
  }

  // REQ-AUTH-005, REQ-AUTH-008
  @PostMapping("/login")
  Me login(@RequestBody Login body, HttpServletRequest request, HttpServletResponse response) {
    open(request);
    Account checked = auth.authenticate(body.email(), body.password(), body.human(), request.getRemoteAddr());
    // REQ-AUTH-042
    return Me.of(sessions.begin(checked, request, response));
  }

  // REQ-AUTH-043
  @PostMapping("/login/second-factor")
  Me secondFactor(@RequestBody SecondFactorCode body, HttpServletRequest request, HttpServletResponse response) {
    open(request);
    HttpSession session = request.getSession(false);
    Object stored = session == null ? null : session.getAttribute(SECOND_FACTOR);
    if (!(stored instanceof PendingLogin pending) || auth.expired(pending)) {
      if (session != null) {
        session.removeAttribute(SECOND_FACTOR);
      }
      throw new AuthRefused(AuthRefused.SECOND_FACTOR_EXPIRED, "Второй шаг входа не начат или просрочен");
    }
    Account confirmed = auth.confirmSecondStep(pending, body.code());
    session.removeAttribute(SECOND_FACTOR);
    Account account = auth.signInAfterSecondStep(confirmed.id());
    sessions.establish(account, request, response);
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

  // REQ-AUTH-035
  @GetMapping("/session")
  Session session() {
    return new Session(CurrentAccount.id().flatMap(accounts::find).map(Me::of).orElse(null));
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

  // REQ-AUTH-023
  @PostMapping("/email")
  ResponseEntity<Void> changeEmail(@RequestBody EmailChange body, HttpServletRequest request) {
    UUID id = CurrentAccount.id().orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Вход не выполнен"));
    auth.requestEmailChange(id, body.current(), body.email(), request.getLocale());
    return ResponseEntity.status(HttpStatus.ACCEPTED).build();
  }

  // REQ-AUTH-023
  @PostMapping("/email/confirm")
  ResponseEntity<Void> confirmEmail(@RequestBody Token body, HttpServletRequest request) {
    open(request);
    HttpSession session = request.getSession(false);
    auth.confirmEmailChange(body.token(), request.getRemoteAddr(), session == null ? null : session.getId(), request.getLocale());
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
