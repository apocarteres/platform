package io.github.apocarteres.platform.time;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

// REQ-JAVA-CLOCK-004
public final class MutableClock extends Clock {

  private final AtomicReference<Instant> current;
  private final ZoneId zone;

  private MutableClock(AtomicReference<Instant> current, ZoneId zone) {
    this.current = current;
    this.zone = zone;
  }

  public static MutableClock at(Instant instant) {
    Objects.requireNonNull(instant, "instant");
    return new MutableClock(new AtomicReference<>(instant), ZoneOffset.UTC);
  }

  public static MutableClock at(String instant) {
    Objects.requireNonNull(instant, "instant");
    return at(Instant.parse(instant));
  }

  public void set(Instant instant) {
    Objects.requireNonNull(instant, "instant");
    current.set(instant);
  }

  public Instant advance(Duration amount) {
    Objects.requireNonNull(amount, "amount");
    return current.updateAndGet(value -> value.plus(amount));
  }

  @Override
  public Instant instant() {
    return current.get();
  }

  @Override
  public ZoneId getZone() {
    return zone;
  }

  @Override
  public Clock withZone(ZoneId other) {
    Objects.requireNonNull(other, "other");
    return other.equals(zone) ? this : new MutableClock(current, other);
  }

  @Override
  public String toString() {
    return "MutableClock[" + current.get() + ", " + zone + "]";
  }
}
