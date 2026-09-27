package io.github.apocarteres.platform.auth;

import java.util.UUID;

// REQ-AUTH-032
public record UsedKey(UUID id, String name) {
}
