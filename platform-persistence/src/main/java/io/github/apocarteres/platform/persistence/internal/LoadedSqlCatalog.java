package io.github.apocarteres.platform.persistence.internal;

import io.github.apocarteres.platform.persistence.SqlCatalog;
import java.util.Map;
import java.util.TreeSet;

// REQ-PERSISTENCE-003
record LoadedSqlCatalog(String directory, Map<String, String> statements) implements SqlCatalog {

  LoadedSqlCatalog {
    statements = Map.copyOf(statements);
  }

  @Override
  public String get(String name) {
    var statement = statements.get(name);
    if (statement == null) {
      throw new IllegalArgumentException(
        "Unknown SQL statement '" + name + "' in directory '" + directory
          + "'; available: " + new TreeSet<>(statements.keySet()));
    }
    return statement;
  }
}
