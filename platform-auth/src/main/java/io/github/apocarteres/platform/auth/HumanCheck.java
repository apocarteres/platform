package io.github.apocarteres.platform.auth;

// REQ-AUTH-003
public interface HumanCheck {

  HumanCheck NOT_REQUIRED = (answer, action, remoteAddress) -> true;

  boolean passed(String answer, String action, String remoteAddress);
}
