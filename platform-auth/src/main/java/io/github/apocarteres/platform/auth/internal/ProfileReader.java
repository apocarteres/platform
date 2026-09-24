package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.RegistrationHook;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

// REQ-AUTH-021
final class ProfileReader {

  private final JsonMapper mapper = JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
  private final RegistrationHook<Object> hook;
  private final Validator validator;

  @SuppressWarnings("unchecked")
  ProfileReader(RegistrationHook<?> hook, Validator validator) {
    this.hook = (RegistrationHook<Object>) hook;
    this.validator = validator;
  }

  Object read(Object declared) {
    Class<?> type = hook.profile();
    Object profile;
    if (declared == null || declared instanceof Map<?, ?>) {
      try {
        profile = mapper.convertValue(declared == null ? Map.of() : declared, type);
      } catch (JacksonException | IllegalArgumentException unreadable) {
        throw new AuthRefused(AuthRefused.PROFILE, "Профиль не разобран в " + type.getSimpleName());
      }
    } else if (type.isInstance(declared)) {
      profile = declared;
    } else {
      throw new IllegalArgumentException("Профиль " + declared.getClass().getName() + " не того вида: хук ждёт " + type.getName());
    }
    Set<ConstraintViolation<Object>> violations = validator.validate(profile);
    if (!violations.isEmpty()) {
      Set<String> fields = new TreeSet<>();
      violations.forEach(violation -> fields.add(violation.getPropertyPath().toString()));
      throw new AuthRefused(AuthRefused.PROFILE, "Профиль не прошёл проверку полей: " + String.join(", ", fields));
    }
    return profile;
  }

  void registered(io.github.apocarteres.platform.auth.Account account, Object profile) {
    hook.registered(account, profile);
  }
}
