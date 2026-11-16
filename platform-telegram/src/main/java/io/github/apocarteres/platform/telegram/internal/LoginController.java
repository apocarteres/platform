package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.SignIn;
import io.github.apocarteres.platform.ratelimit.RateLimit;
import io.github.apocarteres.platform.ratelimit.RateLimiter;
import io.github.apocarteres.platform.telegram.internal.TelegramSettings.Bot;
import io.github.apocarteres.platform.telegram.internal.TelegramViews.SignedIn;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Clock;
import java.time.Duration;
import java.util.OptionalLong;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

// REQ-TELEGRAM-020, REQ-AUTH-048
@RestController
@RequestMapping("/api/telegram")
class LoginController {

  // REQ-TELEGRAM-020
  static final RateLimit BY_ADDRESS = new RateLimit("telegram-login-by-address", Duration.ofMinutes(15), 50);

  private final LinkService links;
  private final SignIn sessions;
  private final RateLimiter limiter;
  private final TelegramSettings settings;
  private final Clock clock;

  LoginController(LinkService links, SignIn sessions, RateLimiter limiter, TelegramSettings settings, Clock clock) {
    this.links = links;
    this.sessions = sessions;
    this.limiter = limiter;
    this.settings = settings;
    this.clock = clock;
  }

  @PostMapping("/{bot}/login")
  SignedIn login(@PathVariable String bot, @RequestBody JsonNode body, HttpServletRequest request, HttpServletResponse response) {
    limiter.consume(BY_ADDRESS, request.getRemoteAddr());
    Bot declared = settings.bot(bot);
    OptionalLong user = LoginData.verify(body, declared.token(), clock.instant(), settings.loginAge());
    // REQ-AUTH-003
    UUID account = user.isEmpty() ? null : links.account(declared.id(), user.getAsLong()).orElse(null);
    if (account == null) {
      throw new AuthRefused(AuthRefused.CREDENTIALS, "Вход через Telegram не подтверждён");
    }
    Account signed = sessions.signIn(account, request, response);
    return new SignedIn(signed.id(), signed.email(), signed.roles());
  }
}
