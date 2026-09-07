package io.github.apocarteres.platform.persistence;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

// REQ-PERSISTENCE-013, REQ-PERSISTENCE-014, REQ-PERSISTENCE-015
public final class StoredInstant {

    private StoredInstant() {
    }

    public static Instant of(Instant value) {
        return value == null ? null : value.truncatedTo(ChronoUnit.MICROS);
    }

    public static OffsetDateTime offsetOf(Instant value) {
        Instant stored = of(value);
        return stored == null ? null : stored.atOffset(ZoneOffset.UTC);
    }

    public static OffsetDateTime offsetOf(Clock clock) {
        return offsetOf(clock.instant());
    }
}
