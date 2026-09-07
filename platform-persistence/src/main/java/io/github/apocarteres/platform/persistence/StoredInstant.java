package io.github.apocarteres.platform.persistence;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

// REQ-PERSISTENCE-013, REQ-PERSISTENCE-014
public final class StoredInstant {

    private StoredInstant() {
    }

    public static Instant of(Instant value) {
        return value == null ? null : value.truncatedTo(ChronoUnit.MICROS);
    }
}
