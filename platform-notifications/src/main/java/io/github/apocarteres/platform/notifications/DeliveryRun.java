package io.github.apocarteres.platform.notifications;

// REQ-NOTIFICATIONS-013, REQ-NOTIFICATIONS-014
public record DeliveryRun(int delivered, int skipped, int failed, int postponed) {

  public int claimed() {
    return delivered + skipped + failed + postponed;
  }
}
