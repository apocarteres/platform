package io.github.apocarteres.platform.persistence;

// REQ-PERSISTENCE-001, REQ-PERSISTENCE-002, REQ-PERSISTENCE-004
public interface SqlStatements {

  SqlCatalog catalog(String directory);
}
