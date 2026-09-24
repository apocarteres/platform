package io.github.apocarteres.platform.support.internal;

import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.support.AttachmentStore;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-SUPPORT-005
final class DatabaseAttachmentStore implements AttachmentStore {

  private final JdbcClient jdbc;
  private final SqlCatalog sql;

  DatabaseAttachmentStore(JdbcClient jdbc, SqlCatalog sql) {
    this.jdbc = jdbc;
    this.sql = sql;
  }

  @Override
  public void put(UUID attachment, byte[] content, String contentType) {
    jdbc.sql(sql.get("content-insert")).param("id", attachment).param("content", content).update();
  }

  @Override
  public Optional<byte[]> get(UUID attachment) {
    return jdbc.sql(sql.get("content-by-id")).param("id", attachment).query(byte[].class).optional();
  }

  @Override
  public void delete(UUID attachment) {
    jdbc.sql(sql.get("content-delete")).param("id", attachment).update();
  }
}
