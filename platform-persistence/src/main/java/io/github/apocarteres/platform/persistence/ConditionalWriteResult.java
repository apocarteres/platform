package io.github.apocarteres.platform.persistence;

/**
 * Результат условной записи: запись выполняется одним оператором
 * с проверкой ожидаемого состояния, и её исход различим по типу.
 *
 * <p>Зачем тип, а не исключение. Конфликт версий и отсутствие записи —
 * это два разных ожидаемых исхода бизнес-операции, а не сбой. Исключение
 * заставляет вызывающего разбирать сообщение или тип исключения драйвера,
 * тогда как sealed-тип делает перечень исходов частью подписи метода:
 * пропустить ветку нельзя, компилятор о ней напомнит.
 *
 * <p>Различие {@link Missing} и {@link Conflict} определяется повторным
 * чтением по идентификатору: если строка отсутствует — {@code Missing},
 * если присутствует с другой версией — {@code Conflict}.
 *
 * @param <T> тип записанного состояния, возвращаемого через {@code RETURNING}
 */
public sealed interface ConditionalWriteResult<T>
  permits ConditionalWriteResult.Applied,
          ConditionalWriteResult.Missing,
          ConditionalWriteResult.Conflict,
          ConditionalWriteResult.Rejected {

  /**
   * Возвращает записанное состояние или отказывает, если запись не применена.
   *
   * <p>Предназначен для мест, где неприменённая запись означает нарушение
   * инварианта вызывающего, а не ожидаемый исход.
   */
  default T required(String failureMessage) {
    if (this instanceof Applied<T> applied) {
      return applied.value();
    }
    throw new IllegalStateException(failureMessage);
  }

  /** Запись применена; {@code value} — состояние после записи. */
  record Applied<T>(T value) implements ConditionalWriteResult<T> {
    public Applied {
      if (value == null) {
        throw new IllegalArgumentException("Applied value is required");
      }
    }
  }

  /** Записи с таким идентификатором нет. */
  record Missing<T>() implements ConditionalWriteResult<T> {
  }

  /**
   * Запись существует, но её версия отличается от ожидаемой:
   * состояние изменено параллельно.
   *
   * @param currentVersion версия, найденная в базе
   * @param currentState   краткое описание текущего состояния для сообщения пользователю
   */
  record Conflict<T>(long currentVersion, String currentState) implements ConditionalWriteResult<T> {
  }

  /**
   * Версия совпала, но запись отклонена доменным условием самого оператора:
   * например, переход состояния недопустим из текущего.
   */
  record Rejected<T>(long currentVersion, String currentState) implements ConditionalWriteResult<T> {
  }
}
