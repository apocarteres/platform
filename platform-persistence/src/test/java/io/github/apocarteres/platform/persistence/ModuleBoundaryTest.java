package io.github.apocarteres.platform.persistence;

import io.github.apocarteres.platform.arch.PlatformArchRules;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

// REQ-JAVA-MODULES-001, REQ-JAVA-MODULES-003, REQ-JAVA-MODULES-007
class ModuleBoundaryTest {

  private static final String ROOT = "io.github.apocarteres.platform";

  private final JavaClasses classes = new ClassFileImporter()
    .withImportOption(new ImportOption.DoNotIncludeTests())
    .importPackages(ROOT + ".persistence");

  @Test
  void graphIsFreeOfCycles() {
    PlatformArchRules.modulesAreFreeOfCycles(ROOT + ".persistence").check(classes);
  }

  @Test
  void implementationStaysInside() {
    PlatformArchRules.innerPackagesStayInside(ROOT, "internal").check(classes);
  }

  @Test
  void cyclesAreNotHidden() {
    PlatformArchRules.cyclesAreNotHidden().check(classes);
  }
}
