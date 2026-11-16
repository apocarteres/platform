package io.github.apocarteres.platform.notifications;

import java.time.Duration;

// REQ-NOTIFICATIONS-014
public record Delivery(Outcome outcome, Duration after) {

  public enum Outcome {
    DELIVERED,
    SKIPPED,
    FAILED,
    RETRY,
    LATER
  }

  public Delivery {
    if (outcome == null) {
      throw new IllegalArgumentException("Исход доставки не назван");
    }
    if (after != null && after.isNegative()) {
      throw new IllegalArgumentException("Срок следующей попытки отрицательный: " + after);
    }
  }

  public static Delivery delivered() {
    return new Delivery(Outcome.DELIVERED, null);
  }

  public static Delivery skipped() {
    return new Delivery(Outcome.SKIPPED, null);
  }

  public static Delivery failed() {
    return new Delivery(Outcome.FAILED, null);
  }

  public static Delivery retry() {
    return new Delivery(Outcome.RETRY, null);
  }

  public static Delivery retry(Duration after) {
    return new Delivery(Outcome.RETRY, after);
  }

  public static Delivery later(Duration after) {
    return new Delivery(Outcome.LATER, after);
  }
}
