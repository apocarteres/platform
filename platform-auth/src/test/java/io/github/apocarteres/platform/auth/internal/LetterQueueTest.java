package io.github.apocarteres.platform.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.apocarteres.platform.auth.AuthLetters;
import java.net.URI;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

// REQ-AUTH-003, REQ-AUTH-010
class LetterQueueTest {

  @Test
  @DisplayName("Письмо уходит отдельным потоком: медленный и отказавший порт писем не задерживает и не роняет вызов")
  void lettersLeaveWithoutTheCaller() throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch sent = new CountDownLatch(1);
    AuthLetters slow = new AuthLetters() {
      @Override
      public void verification(String email, URI link, Locale locale) {
        try {
          release.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
          Thread.currentThread().interrupt();
        }
        sent.countDown();
      }

      @Override
      public void passwordReset(String email, URI link, Locale locale) {
        throw new IllegalStateException("почтовый сервис отказал");
      }

      @Override
      public void emailChange(String email, URI link, Locale locale) {
      }

      @Override
      public void emailChanged(String previousEmail, Locale locale) {
      }
    };
    try (LetterQueue queue = LetterQueue.of(slow)) {
      long started = System.nanoTime();
      queue.verification("slow@site.example", URI.create("https://site.example/v"), Locale.ROOT);
      queue.passwordReset("broken@site.example", URI.create("https://site.example/r"), Locale.ROOT);
      assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)).as("вызов не ждёт письма").isLessThan(1000);
      assertThat(sent.getCount()).as("письмо ещё не ушло").isEqualTo(1);
      release.countDown();
      assertThat(sent.await(10, TimeUnit.SECONDS)).as("письмо ушло из очереди").isTrue();
    }
  }
}
