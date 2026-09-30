package io.github.apocarteres.platform.support.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import liquibase.Contexts;
import liquibase.LabelExpression;
import liquibase.Liquibase;
import liquibase.database.Database;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;

// REQ-DATA-ACCESS-007, REQ-DATA-ACCESS-008
class CoreChangelogTest {

  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

  // REQ-DATA-ACCESS-007
  static final List<String> CHANGELOGS = List.of(
    "platform/changelog/platform-auth.yaml",
    "platform/changelog/platform-notifications.yaml",
    "platform/changelog/platform-support.yaml",
    "platform/changelog/platform-job-lock.yaml"
  );

  private static final List<String> SAMPLES = List.of(
    "sql/platform-auth/create-account.sql", "sql/platform-auth/create-role.sql", "sql/platform-auth/create-token.sql",
    "sql/platform-auth/create-access-key.sql", "sql/platform-notifications/create-notification.sql",
    "sql/platform-support/create-request.sql", "sql/platform-support/create-entry.sql", "sql/platform-support/create-attachment.sql",
    "sql/platform-support/create-attachment-content.sql", "sql/platform-support/create-answer-link.sql",
    "sql/platform-job-lock/create-table.sql"
  );

  static {
    POSTGRES.start();
  }

  private static Connection database(String name) throws SQLException {
    try (Connection admin = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
      Statement statement = admin.createStatement()) {
      statement.execute("CREATE DATABASE " + name);
    }
    return DriverManager.getConnection(POSTGRES.getJdbcUrl().replace("/" + POSTGRES.getDatabaseName(), "/" + name),
      POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static void fromSamples(Connection connection) throws Exception {
    try (Statement statement = connection.createStatement()) {
      for (String sample : SAMPLES) {
        try (var input = CoreChangelogTest.class.getClassLoader().getResourceAsStream(sample)) {
          statement.execute(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
      }
    }
  }

  private static Liquibase liquibase(Connection connection, String changelog) throws Exception {
    Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
    return new Liquibase(changelog, new ClassLoaderResourceAccessor(), database);
  }

  private static List<String> schema(Connection connection) throws SQLException {
    List<String> found = new ArrayList<>();
    try (Statement statement = connection.createStatement()) {
      try (ResultSet rows = statement.executeQuery("SELECT table_name, column_name, data_type, is_nullable, character_maximum_length,"
        + " is_identity, identity_generation FROM information_schema.columns WHERE table_schema = 'public'"
        + " AND table_name NOT LIKE 'databasechangelog%' ORDER BY table_name, column_name")) {
        while (rows.next()) {
          found.add("column " + rows.getString(1) + "." + rows.getString(2) + " " + rows.getString(3) + " null=" + rows.getString(4)
            + " len=" + rows.getString(5) + " identity=" + rows.getString(6) + "/" + rows.getString(7));
        }
      }
      try (ResultSet rows = statement.executeQuery("SELECT conrelid::regclass::text, contype, pg_get_constraintdef(oid)"
        + " FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conrelid::regclass::text NOT LIKE 'databasechangelog%'"
        + " ORDER BY 1, 2, 3")) {
        while (rows.next()) {
          found.add("constraint " + rows.getString(1) + " " + rows.getString(2) + " " + rows.getString(3));
        }
      }
    }
    return found;
  }

  @Test
  @DisplayName("Журналы ядра создают ту же схему, что образцы create-*.sql: образцы не расходятся с журналами")
  void changelogsMatchTheSamples() throws Exception {
    try (Connection samples = database("from_samples"); Connection changelogs = database("from_changelogs")) {
      fromSamples(samples);
      for (String changelog : CHANGELOGS) {
        liquibase(changelogs, changelog).update(new Contexts(), new LabelExpression());
      }
      assertThat(schema(samples)).isNotEmpty();
      assertThat(schema(changelogs)).isEqualTo(schema(samples));
    }
  }

  // REQ-DATA-ACCESS-008
  @Test
  @DisplayName("База, созданная из образцов, после changelogSync принимает журналы ядра без изменения схемы")
  void existingDatabaseAdoptsTheChangelogs() throws Exception {
    try (Connection existing = database("existing")) {
      fromSamples(existing);
      List<String> before = schema(existing);
      for (String changelog : CHANGELOGS) {
        liquibase(existing, changelog).changeLogSync(new Contexts(), new LabelExpression());
      }
      for (String changelog : CHANGELOGS) {
        Liquibase liquibase = liquibase(existing, changelog);
        assertThat(liquibase.listUnrunChangeSets(new Contexts(), new LabelExpression())).as(changelog).isEmpty();
        liquibase.update(new Contexts(), new LabelExpression());
      }
      assertThat(schema(existing)).isEqualTo(before);
    }
  }
}
