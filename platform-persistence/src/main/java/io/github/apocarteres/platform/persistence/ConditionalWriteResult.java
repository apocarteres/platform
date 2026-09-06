package io.github.apocarteres.platform.persistence;

// REQ-PERSISTENCE-006, REQ-PERSISTENCE-007, ADR-0002
public sealed interface ConditionalWriteResult<T>
  permits ConditionalWriteResult.Applied,
          ConditionalWriteResult.Missing,
          ConditionalWriteResult.Conflict,
          ConditionalWriteResult.Rejected {

  // REQ-PERSISTENCE-008
  default T required(String failureMessage) {
    if (this instanceof Applied<T> applied) {
      return applied.value();
    }
    throw new IllegalStateException(failureMessage);
  }

  record Applied<T>(T value) implements ConditionalWriteResult<T> {
    public Applied {
      if (value == null) {
        throw new IllegalArgumentException("Applied value is required");
      }
    }
  }

  record Missing<T>() implements ConditionalWriteResult<T> {
  }

  record Conflict<T>(long currentVersion, String currentState) implements ConditionalWriteResult<T> {
  }

  record Rejected<T>(long currentVersion, String currentState) implements ConditionalWriteResult<T> {
  }
}
