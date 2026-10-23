package io.github.apocarteres.platform.auth;

import java.util.UUID;

// REQ-AUTH-044
public record EmailChanged(UUID account, String previous, String email) {
}
