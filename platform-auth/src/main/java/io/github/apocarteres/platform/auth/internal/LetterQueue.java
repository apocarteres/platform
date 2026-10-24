package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.AuthLetters;
import java.net.URI;
import java.util.Locale;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

// REQ-AUTH-010, REQ-AUTH-003
final class LetterQueue implements AutoCloseable {

  private static final Log LOG = LogFactory.getLog(LetterQueue.class);
  private static final int SENDERS = 2;
  private static final int WAITING = 1000;
  private static final long SHUTDOWN_SECONDS = 30;

  private final AuthLetters letters;
  private final Executor senders;

  LetterQueue(AuthLetters letters, Executor senders) {
    this.letters = letters;
    this.senders = senders;
  }

  static LetterQueue of(AuthLetters letters) {
    ThreadPoolExecutor senders = new ThreadPoolExecutor(SENDERS, SENDERS, 60, TimeUnit.SECONDS, new ArrayBlockingQueue<>(WAITING),
      Thread.ofPlatform().name("platform-auth-letters-", 0).daemon(true).factory());
    senders.allowCoreThreadTimeOut(true);
    return new LetterQueue(letters, senders);
  }

  void verification(String email, URI link, Locale locale) {
    queue("verification", () -> letters.verification(email, link, locale));
  }

  void passwordReset(String email, URI link, Locale locale) {
    queue("password-reset", () -> letters.passwordReset(email, link, locale));
  }

  // REQ-AUTH-023
  void emailChange(String email, URI link, Locale locale) {
    queue("email-change", () -> letters.emailChange(email, link, locale));
  }

  // REQ-AUTH-023
  void emailChanged(String previousEmail, Locale locale) {
    queue("email-changed", () -> letters.emailChanged(previousEmail, locale));
  }

  private void queue(String letter, Runnable send) {
    try {
      senders.execute(() -> {
        try {
          send.run();
        } catch (RuntimeException failure) {
          LOG.warn("Письмо входа " + letter + " не отправлено: " + failure.getClass().getName());
        }
      });
    } catch (RejectedExecutionException full) {
      LOG.warn("Очередь писем входа заполнена: письмо " + letter + " не отправлено");
    }
  }

  @Override
  public void close() {
    if (senders instanceof ExecutorService service) {
      service.shutdown();
      try {
        service.awaitTermination(SHUTDOWN_SECONDS, TimeUnit.SECONDS);
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
      }
    }
  }
}
