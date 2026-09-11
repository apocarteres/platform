package io.github.apocarteres.platform.persistence;

// REQ-SECRETS-003
public final class SecretMismatchException extends RuntimeException {

  SecretMismatchException(String message, Throwable cause) {
    super(message, cause);
  }
}
