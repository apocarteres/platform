package io.github.apocarteres.platform.support.internal;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.apocarteres.platform.support.RequestState;
import java.time.Instant;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

// REQ-SUPPORT-016
@SpringBootTest(
  classes = SupportFlowTest.Service.class,
  properties = {
    "spring.liquibase.enabled=false",
    "platform.auth.roles=USER,ADMIN",
    "platform.auth.default-roles=USER",
    "platform.auth.link-base=https://site.example",
    "platform.auth.session.cookie-secure=false",
    "platform.support.operator-role=ADMIN",
    "spring.servlet.multipart.max-file-size=5MB",
    "spring.servlet.multipart.max-request-size=16MB",
  }
)
class OperatorListTest {

  private static final Instant START = Instant.parse("2026-11-16T10:00:00Z");

  @DynamicPropertySource
  static void stores(DynamicPropertyRegistry registry) {
    SupportFlowTest.stores(registry);
  }

  @Autowired
  private DataSource source;
  @Autowired
  private RequestStore requests;
  @Autowired
  private SupportController controller;

  private JdbcClient jdbc;
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    jdbc = JdbcClient.create(source);
    jdbc.sql("DELETE FROM platform_support_attachment_content").update();
    jdbc.sql("DELETE FROM platform_support_request").update();
    mvc = MockMvcBuilders.standaloneSetup(controller).build();
  }

  private void request(long number, RequestState state, int createdMinute, int activeMinute) {
    UUID id = UUID.randomUUID();
    requests.insert(id, number, null, "guest@mail.example", "ru", "обращение " + number, "{}", "[]",
      START.plusSeconds(60L * createdMinute));
    jdbc.sql("UPDATE platform_support_request SET state = :state, updated_at = :at WHERE id = :id").param("state", state.name())
      .param("at", java.sql.Timestamp.from(START.plusSeconds(60L * activeMinute))).param("id", id).update();
  }

  @Test
  @DisplayName("Отбор по нескольким состояниям и порядок по последней активности; без параметров — как прежде")
  void filtersByStatesAndOrdersByActivity() throws Exception {
    request(10_000_001L, RequestState.NEW, 1, 1);
    request(10_000_002L, RequestState.IN_PROGRESS, 2, 9);
    request(10_000_003L, RequestState.ANSWERED, 3, 3);
    request(10_000_004L, RequestState.NEW, 4, 5);
    request(10_000_005L, RequestState.IN_PROGRESS, 5, 5);

    mvc.perform(get("/api/support/operator/requests")).andExpect(status().isOk())
      .andExpect(jsonPath("$.total").value(5)).andExpect(jsonPath("$.items[0].number").value(10_000_005L))
      .andExpect(jsonPath("$.items[4].number").value(10_000_001L));
    mvc.perform(get("/api/support/operator/requests?state=ANSWERED")).andExpect(jsonPath("$.total").value(1))
      .andExpect(jsonPath("$.items[0].number").value(10_000_003L));
    mvc.perform(get("/api/support/operator/requests?state=NEW&state=IN_PROGRESS&order=ACTIVITY&size=3"))
      .andExpect(jsonPath("$.total").value(4)).andExpect(jsonPath("$.items.length()").value(3))
      .andExpect(jsonPath("$.items[0].number").value(10_000_002L))
      .andExpect(jsonPath("$.items[1].number").value(10_000_005L))
      .andExpect(jsonPath("$.items[2].number").value(10_000_004L));
    mvc.perform(get("/api/support/operator/requests?state=NEW&state=IN_PROGRESS&order=ACTIVITY&size=3&page=1"))
      .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].number").value(10_000_001L));
    mvc.perform(get("/api/support/operator/requests?order=SOMETIME")).andExpect(status().isBadRequest());
  }

  @Test
  @DisplayName("Числа по состояниям одним запросом: каждое состояние названо, пустое — нулём")
  void countsEveryState() throws Exception {
    request(10_000_001L, RequestState.NEW, 1, 1);
    request(10_000_002L, RequestState.NEW, 2, 2);
    request(10_000_003L, RequestState.CLOSED, 3, 3);

    mvc.perform(get("/api/support/operator/counts")).andExpect(status().isOk())
      .andExpect(jsonPath("$.states.length()").value(4))
      .andExpect(jsonPath("$.states[0].state").value("NEW")).andExpect(jsonPath("$.states[0].total").value(2))
      .andExpect(jsonPath("$.states[1].state").value("IN_PROGRESS")).andExpect(jsonPath("$.states[1].total").value(0))
      .andExpect(jsonPath("$.states[2].state").value("ANSWERED")).andExpect(jsonPath("$.states[2].total").value(0))
      .andExpect(jsonPath("$.states[3].state").value("CLOSED")).andExpect(jsonPath("$.states[3].total").value(1));
  }
}
