package io.github.apocarteres.platform.auth;

import java.util.UUID;

// REQ-AUTH-017
public record AccountVerified(UUID id, String email) {
}
