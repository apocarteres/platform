package io.github.apocarteres.platform.telegram;

import java.util.Optional;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

// REQ-TELEGRAM-019
public final class TelegramMiniApp {

  public static final String ATTRIBUTE = TelegramMiniApp.class.getName() + ".user";

  private TelegramMiniApp() {
  }

  public static Optional<MiniAppUser> user() {
    RequestAttributes request = RequestContextHolder.getRequestAttributes();
    if (request != null && request.getAttribute(ATTRIBUTE, RequestAttributes.SCOPE_REQUEST) instanceof MiniAppUser user) {
      return Optional.of(user);
    }
    return Optional.empty();
  }
}
