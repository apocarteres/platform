package io.github.apocarteres.platform.auth.internal;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

// REQ-AUTH-042, REQ-AUTH-013
record PendingLogin(UUID account, Instant expires) implements Serializable {
}
