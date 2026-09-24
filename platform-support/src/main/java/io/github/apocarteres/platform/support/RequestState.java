package io.github.apocarteres.platform.support;

import java.util.EnumSet;
import java.util.Set;

// REQ-SUPPORT-007
public enum RequestState {
  NEW,
  IN_PROGRESS,
  ANSWERED,
  CLOSED;

  // REQ-SUPPORT-007
  public Set<RequestState> operatorMoves() {
    return switch (this) {
      case NEW -> EnumSet.of(IN_PROGRESS, CLOSED);
      case IN_PROGRESS -> EnumSet.of(CLOSED);
      case ANSWERED -> EnumSet.of(IN_PROGRESS, CLOSED);
      case CLOSED -> EnumSet.of(IN_PROGRESS);
    };
  }

  // REQ-SUPPORT-007
  public RequestState afterOperatorMessage() {
    return this == CLOSED ? CLOSED : ANSWERED;
  }

  // REQ-SUPPORT-007
  public RequestState afterAuthorMessage() {
    return this == ANSWERED ? IN_PROGRESS : this;
  }
}
