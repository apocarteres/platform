package io.github.apocarteres.platform.persistence;

// REQ-PERSISTENCE-001, REQ-PERSISTENCE-003
public interface SqlCatalog {

  String get(String name);
}
