package io.github.apocarteres.platform.auth;

import java.util.UUID;

// REQ-AUTH-044
public record PasswordChanged(UUID account) {
}
