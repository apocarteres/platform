package io.github.apocarteres.platform.persistence;

// REQ-PERSISTENCE-009, REQ-PERSISTENCE-010, ADR-0002
public interface SqlCommandWriter {

  String write(Object command);
}
