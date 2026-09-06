package io.github.apocarteres.platform.persistence;

/**
 * Порт, выдающий {@link SqlCatalog} для одного каталога ресурсов SQL.
 *
 * <p>Каталог соответствует доменной области: {@code sql/character-label},
 * {@code sql/agent-sync-inbox} и так далее. Доменный DAO получает свой каталог
 * один раз в конструкторе и далее обращается к запросам по имени.
 */
public interface SqlStatements {

  /**
   * @param directory имя каталога внутри {@code classpath:sql/}
   * @throws IllegalArgumentException если имя каталога пустое или содержит обход дерева
   * @throws IllegalStateException если каталог отсутствует, пуст или содержит пустой файл
   */
  SqlCatalog catalog(String directory);
}
