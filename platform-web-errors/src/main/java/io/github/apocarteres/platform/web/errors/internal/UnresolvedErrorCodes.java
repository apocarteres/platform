package io.github.apocarteres.platform.web.errors.internal;

import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.github.apocarteres.platform.web.errors.ErrorCodeResolver;
import java.util.Optional;

// REQ-API-002
final class UnresolvedErrorCodes implements ErrorCodeResolver {

  @Override
  public Optional<ErrorCode> resolve(Throwable failure) {
    return Optional.empty();
  }
}
