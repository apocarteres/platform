package io.github.apocarteres.platform.auth;

// REQ-AUTH-003, REQ-AUTH-021
public interface RegistrationHook<P> {

  RegistrationHook<NoProfile> NONE = new RegistrationHook<>() {
    @Override
    public Class<NoProfile> profile() {
      return NoProfile.class;
    }

    @Override
    public void registered(Account account, NoProfile profile) {
    }
  };

  Class<P> profile();

  void registered(Account account, P profile);
}
