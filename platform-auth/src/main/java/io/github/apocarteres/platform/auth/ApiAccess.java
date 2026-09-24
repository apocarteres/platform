package io.github.apocarteres.platform.auth;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;

// REQ-AUTH-014
public interface ApiAccess {

  ApiAccess AUTHENTICATED = rules -> { };

  void rules(AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry rules);
}
