package io.github.apocarteres.platform.persistence.internal;

import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.SqlStatements;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.core.io.ResourceLoader;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

// REQ-PERSISTENCE-002, REQ-PERSISTENCE-004, REQ-PERSISTENCE-005
public final class ResourceSqlStatements implements SqlStatements {

  private final PathMatchingResourcePatternResolver resourcePatterns;
  private final Map<String, SqlCatalog> catalogs = new ConcurrentHashMap<>();

  public ResourceSqlStatements(ResourceLoader resources) {
    this.resourcePatterns = new PathMatchingResourcePatternResolver(resources);
  }

  @Override
  public SqlCatalog catalog(String directory) {
    return catalogs.computeIfAbsent(normalizeDirectory(directory), this::loadCatalog);
  }

  private static String normalizeDirectory(String directory) {
    if (directory == null || directory.isBlank()) {
      throw new IllegalArgumentException("SQL directory is required");
    }
    var normalized = directory.strip().replace('\\', '/');
    while (normalized.startsWith("/")) {
      normalized = normalized.substring(1);
    }
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    if (normalized.isBlank() || normalized.contains("..") || normalized.contains("//")) {
      throw new IllegalArgumentException("Invalid SQL directory: " + directory);
    }
    return normalized;
  }

  private SqlCatalog loadCatalog(String directory) {
    var loaded = new LinkedHashMap<String, String>();
    try {
      var matches = resourcePatterns.getResources("classpath*:sql/" + directory + "/*.sql");
      if (matches.length == 0) {
        throw new IllegalStateException("SQL directory does not exist or is empty: " + directory);
      }
      for (var resource : matches) {
        var filename = resource.getFilename();
        if (filename == null || !filename.endsWith(".sql")) {
          throw new IllegalStateException("Invalid SQL resource in directory: " + directory);
        }
        var name = filename.substring(0, filename.length() - ".sql".length());
        var statement = resource.getContentAsString(StandardCharsets.UTF_8);
        if (statement.isBlank()) {
          throw new IllegalStateException("SQL statement is empty: " + directory + "/" + filename);
        }
        if (loaded.putIfAbsent(name, statement) != null) {
          throw new IllegalStateException("Duplicate SQL statement: " + directory + "/" + filename);
        }
      }
    } catch (IOException exception) {
      throw new UncheckedIOException("Cannot read SQL directory: " + directory, exception);
    }
    return new LoadedSqlCatalog(directory, loaded);
  }
}
