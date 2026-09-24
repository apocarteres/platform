package io.github.apocarteres.platform.support;

import java.net.URI;
import java.util.Locale;
import java.util.Optional;

// REQ-SUPPORT-009
public record AnswerNotice(String email, long number, URI link, Optional<String> text, Locale locale) {
}
