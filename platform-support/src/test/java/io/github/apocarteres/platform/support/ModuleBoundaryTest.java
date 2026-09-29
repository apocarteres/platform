package io.github.apocarteres.platform.support;

import io.github.apocarteres.platform.arch.PlatformArchRules;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.Set;
import org.junit.jupiter.api.Test;

// REQ-JAVA-MODULES-001, REQ-JAVA-MODULES-003, REQ-JAVA-MODULES-007, REQ-DATA-ACCESS-002
class ModuleBoundaryTest {

  private static final String ROOT = "io.github.apocarteres.platform";

  private final JavaClasses classes = new ClassFileImporter()
    .withImportOption(new ImportOption.DoNotIncludeTests())
    .importPackages(ROOT + ".support");

  @Test
  void graphIsFreeOfCycles() {
    PlatformArchRules.modulesAreFreeOfCycles(ROOT + ".support").check(classes);
  }

  @Test
  void implementationStaysInside() {
    PlatformArchRules.innerPackagesStayInside(ROOT, "internal").check(classes);
  }

  @Test
  void cyclesAreNotHidden() {
    PlatformArchRules.cyclesAreNotHidden().check(classes);
  }

  // REQ-DATA-ACCESS-002, REQ-DATA-ACCESS-005
  private static final Set<String> DATA_ACCESS = Set.of(
    ROOT + ".support.internal.RequestStore",
    ROOT + ".support.internal.DatabaseAttachmentStore"
  );

  @Test
  void dataAccessRunsOneStatementPerMethod() {
    PlatformArchRules.dataAccessMethodsRunOneStatement(
      DescribedPredicate.describe("слой доступа модуля", type -> DATA_ACCESS.contains(type.getFullName()))
    ).check(classes);
  }
}
