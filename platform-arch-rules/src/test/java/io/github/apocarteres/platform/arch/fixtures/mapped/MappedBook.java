package io.github.apocarteres.platform.arch.fixtures.mapped;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class MappedBook {

  @Id
  private long id;

  public long id() {
    return id;
  }
}
