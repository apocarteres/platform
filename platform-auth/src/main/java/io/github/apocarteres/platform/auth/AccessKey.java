package io.github.apocarteres.platform.auth;

import java.time.Instant;
import java.util.UUID;

// REQ-AUTH-029, REQ-AUTH-034
public record AccessKey(UUID id, String name, Instant createdAt, Instant expiresAt, Instant lastUsedAt) {
}
