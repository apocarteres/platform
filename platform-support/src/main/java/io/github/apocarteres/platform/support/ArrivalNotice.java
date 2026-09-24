package io.github.apocarteres.platform.support;

import java.net.URI;
import java.util.UUID;

// REQ-SUPPORT-009
public record ArrivalNotice(UUID request, long number, URI link, boolean first) {
}
