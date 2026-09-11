package io.github.apocarteres.platform.web.errors;

import java.util.Map;

// REQ-API-007
public interface ErrorExtensions {

  Map<String, Object> forFailure(Throwable failure, ErrorCode code);
}
