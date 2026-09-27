package io.github.apocarteres.platform.auth;

// REQ-AUTH-029
public record IssuedKey(AccessKey key, String value) {

  @Override
  public String toString() {
    return "IssuedKey[key=" + key + ", value=<скрыто>]";
  }
}
