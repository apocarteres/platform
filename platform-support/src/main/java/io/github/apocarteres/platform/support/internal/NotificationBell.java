package io.github.apocarteres.platform.support.internal;

import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.notifications.Notifications;
import java.util.Map;
import java.util.UUID;

// REQ-SUPPORT-015, REQ-NOTIFICATIONS-007
final class NotificationBell implements SupportBell {

  static final String ANSWERED = "support.answered";
  static final String ARRIVED = "support.arrived";

  private final Notifications notifications;
  private final Accounts accounts;
  private final SupportSettings settings;

  NotificationBell(Notifications notifications, Accounts accounts, SupportSettings settings) {
    this.notifications = notifications;
    this.accounts = accounts;
    this.settings = settings;
  }

  @Override
  public void answered(UUID author, long number, UUID request) {
    notifications.notify(author, ANSWERED, Map.of("number", Long.toString(number)), settings.requestPath(request));
  }

  @Override
  public void arrived(long number, UUID request) {
    for (UUID operator : accounts.withRole(settings.operatorRole())) {
      notifications.notify(operator, ARRIVED, Map.of("number", Long.toString(number)), settings.operatorPath(request));
    }
  }
}
