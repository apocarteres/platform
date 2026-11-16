package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.auth.ExternalIdentity;
import io.github.apocarteres.platform.auth.RequestAuthenticator;
import io.github.apocarteres.platform.telegram.MiniAppUser;
import io.github.apocarteres.platform.telegram.TelegramMiniApp;
import io.github.apocarteres.platform.telegram.internal.TelegramSettings.Bot;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

// REQ-TELEGRAM-018, REQ-TELEGRAM-019, REQ-AUTH-037
final class MiniAppAuthenticator implements RequestAuthenticator {

  static final String HEADER = "X-Telegram-Init-Data";
  static final String KIND = "telegram";

  private record Covered(RequestMatcher matcher, Bot bot) {
  }

  private final List<Covered> covered;
  private final Set<String> paths;
  private final TelegramSettings settings;
  private final Clock clock;

  MiniAppAuthenticator(TelegramSettings settings, Clock clock) {
    this.settings = settings;
    this.clock = clock;
    this.covered = settings.bots().values().stream().sorted(java.util.Comparator.comparing(Bot::id))
      .flatMap(bot -> bot.miniApp().paths().stream().map(path -> new Covered(PathPatternRequestMatcher.withDefaults().matcher(path), bot)))
      .toList();
    this.paths = settings.bots().values().stream().flatMap(bot -> bot.miniApp().paths().stream()).collect(Collectors.toUnmodifiableSet());
  }

  @Override
  public Set<String> paths() {
    return paths;
  }

  @Override
  public Optional<ExternalIdentity> authenticate(HttpServletRequest request) {
    Bot bot = covered.stream().filter(one -> one.matcher().matches(request)).map(Covered::bot).findFirst().orElse(null);
    if (bot == null) {
      return Optional.empty();
    }
    return InitData.verify(request.getHeader(HEADER), bot.token(), clock.instant(), settings.miniAppAge()).map(user -> {
      // REQ-TELEGRAM-019
      request.setAttribute(TelegramMiniApp.ATTRIBUTE,
        new MiniAppUser(bot.id(), user.id(), user.firstName(), user.lastName(), user.username(), user.language()));
      return new ExternalIdentity(KIND, Long.toString(user.id()), bot.miniApp().roles());
    });
  }
}
