package io.github.apocarteres.platform.web.errors;

import org.springframework.http.HttpHeaders;

// REQ-API-008
public interface ErrorHeaders {

  HttpHeaders forFailure(Throwable failure, ErrorCode code);
}
