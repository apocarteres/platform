package io.github.apocarteres.platform.persistence;

/**
 * Сериализует команду DAO в JSON для передачи запросу одним параметром.
 *
 * <p>Почему отдельный порт, а не общий {@code ObjectMapper} приложения.
 * Формат, в котором команда попадает в SQL, определяет, разберёт ли её
 * PostgreSQL: приведение {@code ::timestamp} требует ISO-8601, тогда как
 * настройки веб-слоя могут писать дату массивом чисел. Если DAO зависит
 * от настроек сериализации HTTP, изменение формата ответа API молча ломает
 * запись в базу. Порт разрывает эту связь: формат команд принадлежит слою
 * persistence.
 */
public interface SqlCommandWriter {

  /**
   * @throws IllegalArgumentException если команду нельзя сериализовать;
   *         это ошибка программиста, а не ожидаемый исход
   */
  String write(Object command);
}
