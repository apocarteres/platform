package io.github.apocarteres.platform.arch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

class PlatformArchRulesTest {

  private static final String FIXTURES = "io.github.apocarteres.platform.arch.fixtures";

  private final JavaClasses ring = classesOf(FIXTURES + ".ring");
  private final JavaClasses chain = classesOf(FIXTURES + ".chain");
  private final JavaClasses layers = classesOf(FIXTURES);

  // REQ-JAVA-MODULES-003
  @Test
  void namesTheParticipantsOfACycle() {
    ArchRule rule = PlatformArchRules.modulesAreFreeOfCycles(FIXTURES + ".ring");

    assertThatThrownBy(() -> rule.check(ring))
      .hasMessageContaining("left")
      .hasMessageContaining("right");
  }

  // REQ-JAVA-MODULES-003
  @Test
  void acceptsAGraphWithOneDirection() {
    PlatformArchRules.modulesAreFreeOfCycles(FIXTURES + ".chain").check(chain);
  }

  // REQ-JAVA-MODULES-006
  @Test
  void findsACycleOneLevelDown() {
    ArchRule top = PlatformArchRules.modulesAreFreeOfCycles(FIXTURES);
    top.check(ring);

    assertThatThrownBy(() -> PlatformArchRules.submodulesAreFreeOfCycles(FIXTURES + ".ring").check(ring))
      .hasMessageContaining("Cycle");
  }

  // REQ-DATA-ACCESS-003
  @Test
  void refusesATransactionOutsideTheApplicationLayer() {
    ArchRule rule = PlatformArchRules.transactionsAreDeclaredOnlyIn(applicationLayer());

    assertThatThrownBy(() -> rule.check(layers))
      .hasMessageContaining("BookDao");
  }

  // REQ-DATA-ACCESS-004
  @Test
  void takesTheLayerFromTheDeclarationAndNotFromTheName() {
    DescribedPredicate<JavaClass> daoIsApplication =
      DescribedPredicate.describe("объявлено проектом", type -> type.getSimpleName().endsWith("Dao"));

    ArchRule byName = PlatformArchRules.transactionsAreDeclaredOnlyIn(applicationLayer());
    assertThatThrownBy(() -> byName.check(layers)).hasMessageContaining("BookDao");

    ArchRule byDeclaration = PlatformArchRules.transactionsAreDeclaredOnlyIn(daoIsApplication);
    assertThatThrownBy(() -> byDeclaration.check(layers)).hasMessageContaining("BookService");
  }

  // REQ-ADOPTION-022
  @Test
  void passesWhenTheDeclarationCoversEveryClass() {
    DescribedPredicate<JavaClass> everything = DescribedPredicate.describe("весь код прикладной", any -> true);

    PlatformArchRules.transactionsAreDeclaredOnlyIn(everything).check(layers);
  }

  // REQ-DATA-ACCESS-006
  @Test
  void looksAtTheNamedTypesAndNotAtTheirPackage() {
    String[] catalogue = { FIXTURES + ".storage.Statements" };
    ArchRule rule = PlatformArchRules.typesAreUsedOnlyBy(
      catalogue,
      DescribedPredicate.describe("слой доступа", type -> type.getSimpleName().equals("Statements"))
    );

    String refusal = violationsOf(rule, layers);
    assertThat(refusal).contains("BookCatalogue");
    assertThat(refusal).doesNotContain("BookShelf");
  }

  // REQ-DATA-ACCESS-005
  @Test
  void refusesTheCatalogueOutsideTheDataAccessLayer() {
    ArchRule rule = PlatformArchRules.packageIsUsedOnlyBy(
      FIXTURES + ".storage..",
      DescribedPredicate.describe("слой доступа", type -> type.getSimpleName().equals("Statements"))
    );

    assertThatThrownBy(() -> rule.check(layers))
      .hasMessageContaining("BookCatalogue");
  }

  // REQ-DATA-ACCESS-001
  @Test
  void acceptsCodeWithoutObjectRelationalMapping() {
    PlatformArchRules.objectRelationalMappingIsNotUsed().check(layers);
  }

  // REQ-JAVA-MODULES-007
  @Test
  void acceptsCodeWithoutLazyInjection() {
    PlatformArchRules.cyclesAreNotHidden().check(layers);
  }

  // REQ-JAVA-MODULES-001
  @Test
  void letsAModuleUseItsOwnImplementation() {
    JavaClasses alpha = classesOf(FIXTURES + ".modules.alpha");

    PlatformArchRules.innerPackagesStayInside(FIXTURES + ".modules", "internal").check(alpha);
  }

  // REQ-JAVA-MODULES-001
  @Test
  void refusesTheImplementationOfAnotherModule() {
    JavaClasses modules = classesOf(FIXTURES + ".modules");
    ArchRule rule = PlatformArchRules.innerPackagesStayInside(FIXTURES + ".modules", "internal");

    assertThatThrownBy(() -> rule.check(modules))
      .hasMessageContaining("BetaContract")
      .hasMessageContaining("AlphaWorker");
    assertThat(violationsOf(rule, modules)).doesNotContain("AlphaContract");
  }

  private static String violationsOf(ArchRule rule, JavaClasses classes) {
    try {
      rule.check(classes);
      return "";
    } catch (AssertionError refusal) {
      return refusal.getMessage();
    }
  }

  private static DescribedPredicate<JavaClass> applicationLayer() {
    return DescribedPredicate.describe("прикладной слой проекта", type -> type.getSimpleName().endsWith("Service"));
  }

  private static JavaClasses classesOf(String packageName) {
    return new ClassFileImporter().importPackages(packageName);
  }
}
