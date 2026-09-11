package io.github.apocarteres.platform.web.errors;

import java.util.Optional;

// REQ-API-002
public interface ErrorCodeResolver {

  Optional<ErrorCode> resolve(Throwable failure);
}
