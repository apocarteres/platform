package io.github.apocarteres.platform.arch;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;

// REQ-JAVA-MODULES-005, REQ-ADOPTION-021
public final class PlatformArchRules {

  private static final String SQL_CATALOGUE = "io.github.apocarteres.platform.persistence..";
  private static final String LAZY = "org.springframework.context.annotation.Lazy";
  private static final String TRANSACTIONAL = "org.springframework.transaction.annotation.Transactional";
  private static final String PROGRAMMATIC_TRANSACTIONS = "org.springframework.transaction..";
  private static final String[] MAPPING_LIBRARIES = {
    "jakarta.persistence..", "javax.persistence..", "org.hibernate..", "org.springframework.data.jpa..",
  };

  private PlatformArchRules() {
  }

  // REQ-JAVA-MODULES-003
  public static ArchRule modulesAreFreeOfCycles(String rootPackage) {
    return slices()
      .matching(slicesOf(rootPackage))
      .should().beFreeOfCycles()
      .because("цикл отменяет смысл границы: модуль в кольце нельзя собрать, проверить и заменить отдельно");
  }

  // REQ-JAVA-MODULES-006
  public static ArchRule submodulesAreFreeOfCycles(String modulePackage) {
    return modulesAreFreeOfCycles(modulePackage);
  }

  // REQ-JAVA-MODULES-007
  public static ArchRule cyclesAreNotHidden() {
    return noClasses()
      .should().dependOnClassesThat().haveFullyQualifiedName(LAZY)
      .because("отложенное внедрение не снимает цикл, а делает его работоспособным");
  }

  // REQ-JAVA-MODULES-001
  public static ArchRule innerPackagesStayInside(String rootPackage, String innerSegment) {
    return noClasses()
      .should(useImplementationOfAnotherModule(rootPackage, innerSegment))
      .because("реализация модуля лежит во внутренних подпакетах и за пределами своего модуля не используется")
      // REQ-ADOPTION-022
      .allowEmptyShould(true);
  }

  // REQ-JAVA-MODULES-001
  private static ArchCondition<JavaClass> useImplementationOfAnotherModule(String rootPackage, String innerSegment) {
    String description = String.format("обращаться к подпакету %s чужого модуля", innerSegment);
    return new ArchCondition<>(description) {
      @Override
      public void check(JavaClass item, ConditionEvents events) {
        for (Dependency dependency : item.getDirectDependenciesFromSelf()) {
          String target = dependency.getTargetClass().getPackageName();
          if (!implementationPackage(rootPackage, innerSegment, target)) {
            continue;
          }
          String module = moduleOf(rootPackage, target);
          String origin = dependency.getOriginClass().getPackageName();
          if (origin.equals(module) || origin.startsWith(module + ".")) {
            continue;
          }
          events.add(SimpleConditionEvent.satisfied(dependency, dependency.getDescription()));
        }
      }
    };
  }

  private static boolean implementationPackage(String rootPackage, String innerSegment, String target) {
    if (!target.startsWith(rootPackage + ".")) {
      return false;
    }
    String[] parts = target.substring(rootPackage.length() + 1).split("\\.");
    for (int index = 1; index < parts.length; index += 1) {
      if (parts[index].equals(innerSegment)) {
        return true;
      }
    }
    return false;
  }

  private static String moduleOf(String rootPackage, String target) {
    String rest = target.substring(rootPackage.length() + 1);
    int dot = rest.indexOf('.');
    return rootPackage + "." + (dot == -1 ? rest : rest.substring(0, dot));
  }

  // REQ-DATA-ACCESS-001
  public static ArchRule objectRelationalMappingIsNotUsed() {
    return noClasses()
      .should().dependOnClassesThat().resideInAnyPackage(MAPPING_LIBRARIES)
      .because("каталог запросов имеет смысл ровно потому, что другого пути к данным нет");
  }

  // REQ-DATA-ACCESS-005, REQ-DATA-ACCESS-004
  public static ArchRule sqlCatalogueIsUsedOnlyBy(DescribedPredicate<? super JavaClass> dataAccessLayer) {
    return packageIsUsedOnlyBy(SQL_CATALOGUE, dataAccessLayer);
  }

  // REQ-DATA-ACCESS-005
  public static ArchRule packageIsUsedOnlyBy(String packageIdentifier, DescribedPredicate<? super JavaClass> allowed) {
    return noClasses()
      .that(DescribedPredicate.not(allowed))
      .should().dependOnClassesThat().resideInAPackage(packageIdentifier)
      .because("пакет ядра для модульной проверки внешний и потому доступен любому классу проекта")
      // REQ-ADOPTION-022
      .allowEmptyShould(true);
  }

  // REQ-DATA-ACCESS-003, REQ-DATA-ACCESS-004
  public static ArchRule transactionsAreDeclaredOnlyIn(DescribedPredicate<? super JavaClass> applicationLayer) {
    return noClasses()
      .that(DescribedPredicate.not(applicationLayer))
      .should().dependOnClassesThat().haveFullyQualifiedName(TRANSACTIONAL)
      .orShould().dependOnClassesThat().resideInAPackage(PROGRAMMATIC_TRANSACTIONS)
      .because("транзакция принадлежит деловой операции, а не способу её вызова")
      // REQ-ADOPTION-022
      .allowEmptyShould(true);
  }

  private static String slicesOf(String rootPackage) {
    return String.format("%s.(*)..", rootPackage);
  }
}
