package io.github.apocarteres.platform.persistence;

// REQ-SECRETS-003
public final class SecretMismatchException extends RuntimeException {

  // REQ-COMPATIBILITY-001
  private static final long serialVersionUID = 1L;

  SecretMismatchException(String message, Throwable cause) {
    super(message, cause);
  }
}
