package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.MapSession;

// REQ-AUTH-026
class SessionsTest {

  // REQ-AUTH-026, REQ-JAVA-CLOCK
  private static final Instant AHEAD = Instant.parse("2999-01-01T00:00:00Z");

  // REQ-AUTH-026
  static final class SoftDeleting implements FindByIndexNameSessionRepository<MapSession> {

    final Map<String, MapSession> stored = new HashMap<>();
    final Map<String, String> principals = new HashMap<>();

    @Override
    public MapSession createSession() {
      return new MapSession();
    }

    @Override
    public void save(MapSession session) {
      stored.put(session.getId(), new MapSession(session));
    }

    @Override
    public MapSession findById(String id) {
      MapSession found = stored.get(id);
      return found == null || found.isExpired() ? null : new MapSession(found);
    }

    @Override
    public void deleteById(String id) {
      MapSession found = stored.get(id);
      if (found != null) {
        found.setMaxInactiveInterval(Duration.ZERO);
      }
    }

    @Override
    public Map<String, MapSession> findByIndexNameAndIndexValue(String indexName, String indexValue) {
      Map<String, MapSession> found = new HashMap<>();
      principals.forEach((id, principal) -> {
        if (principal.equals(indexValue) && findById(id) != null) {
          found.put(id, findById(id));
        }
      });
      return found;
    }

    String open(UUID account, Instant lastAccessed) {
      MapSession session = new MapSession();
      session.setMaxInactiveInterval(Duration.ofHours(8));
      session.setLastAccessedTime(lastAccessed);
      stored.put(session.getId(), session);
      principals.put(session.getId(), account.toString());
      return session.getId();
    }
  }

  @Test
  @DisplayName("Завершённая сессия истекает сразу, даже если часы шагнули назад и последнее обращение оказалось в будущем")
  void terminatedSessionExpiresDespiteABackwardClockStep() {
    SoftDeleting repository = new SoftDeleting();
    UUID account = UUID.randomUUID();
    String kept = repository.open(account, AHEAD);
    String ahead = repository.open(account, AHEAD);
    String other = repository.open(UUID.randomUUID(), AHEAD);
    assertThat(new Sessions(repository).terminateExcept(account, kept)).isEqualTo(1);
    assertThat(repository.findById(ahead)).as("сессия с обращением «из будущего» после завершения").isNull();
    assertThat(repository.findById(kept)).isNotNull();
    assertThat(repository.findById(other)).as("сессии другой учётной записи не трогаются").isNotNull();
  }
}
