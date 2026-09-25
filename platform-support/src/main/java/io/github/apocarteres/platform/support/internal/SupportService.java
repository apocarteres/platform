package io.github.apocarteres.platform.support.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.ratelimit.RateLimiter;
import io.github.apocarteres.platform.support.AnswerNotice;
import io.github.apocarteres.platform.support.ArrivalNotice;
import io.github.apocarteres.platform.support.AttachmentStore;
import io.github.apocarteres.platform.support.RequestState;
import io.github.apocarteres.platform.support.SupportLetters;
import io.github.apocarteres.platform.support.SupportRefused;
import io.github.apocarteres.platform.support.internal.RequestStore.Kind;
import io.github.apocarteres.platform.support.internal.RequestStore.Side;
import io.github.apocarteres.platform.support.internal.RequestStore.Stored;
import io.github.apocarteres.platform.support.internal.SupportViews.AuthorView;
import io.github.apocarteres.platform.support.internal.SupportViews.File;
import io.github.apocarteres.platform.support.internal.SupportViews.Item;
import io.github.apocarteres.platform.support.internal.SupportViews.OperatorStep;
import io.github.apocarteres.platform.support.internal.SupportViews.OperatorView;
import io.github.apocarteres.platform.support.internal.SupportViews.Page;
import io.github.apocarteres.platform.support.internal.SupportViews.Step;
import io.github.apocarteres.platform.support.internal.SupportViews.Submitted;
import io.github.apocarteres.platform.support.internal.SupportViews.Unread;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

// REQ-SUPPORT-001, REQ-SUPPORT-004, REQ-SUPPORT-005, REQ-SUPPORT-006, REQ-SUPPORT-007, REQ-SUPPORT-008, REQ-SUPPORT-009
final class SupportService {

  static final class Upload {

    private final String name;
    private final byte[] content;

    Upload(String name, byte[] content) {
      this.name = name;
      this.content = content.clone();
    }

    String name() {
      return name;
    }

    byte[] content() {
      return content.clone();
    }

    int size() {
      return content.length;
    }

    boolean starts(byte[] prefix) {
      return content.length >= prefix.length && Arrays.equals(content, 0, prefix.length, prefix, 0, prefix.length);
    }
  }

  private static final Logger LOG = LoggerFactory.getLogger(SupportService.class);
  private static final Pattern EMAIL = Pattern.compile("[^@\\s]{1,64}@[^@\\s]{1,255}\\.[^@\\s]{1,63}");
  private static final SecureRandom RANDOM = new SecureRandom();
  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
  private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};

  private final RequestStore requests;
  private final AttachmentStore files;
  private final Accounts accounts;
  private final RateLimiter limiter;
  private final SupportLetters letters;
  private final SupportBell bell;
  private final TransactionTemplate transactions;
  private final SupportSettings settings;
  private final Clock clock;
  private final JsonMapper json = JsonMapper.builder().build();

  SupportService(RequestStore requests, AttachmentStore files, Accounts accounts, RateLimiter limiter, SupportLetters letters,
    SupportBell bell, TransactionTemplate transactions, SupportSettings settings, Clock clock) {
    this.requests = requests;
    this.files = files;
    this.accounts = accounts;
    this.limiter = limiter;
    this.letters = letters;
    this.bell = bell;
    this.transactions = transactions;
    this.settings = settings;
    this.clock = clock;
  }

  // REQ-SUPPORT-001, REQ-SUPPORT-002, REQ-SUPPORT-003, REQ-SUPPORT-005, REQ-SUPPORT-006
  Submitted submit(Optional<UUID> author, boolean guestAccepted, String declaredEmail, String declaredMessage, Snapshot snapshot,
    List<JournalEntry> journal, List<Upload> uploads, Locale locale) {
    String message = text(declaredMessage);
    List<Upload> attached = uploads.stream().filter(upload -> upload.size() > 0).toList();
    if (attached.size() > SupportLimits.ATTACHMENTS) {
      throw new SupportRefused(SupportRefused.ATTACHMENT, "Вложений больше " + SupportLimits.ATTACHMENTS);
    }
    List<String> types = attached.stream().map(SupportService::imageType).toList();
    String guestEmail = null;
    if (author.isPresent()) {
      limiter.consume(SupportLimits.SUBMIT_BY_ACCOUNT, author.get().toString());
    } else {
      if (!guestAccepted) {
        throw new SupportRefused(SupportRefused.GUEST, "Приём обращений без входа закрыт проектом");
      }
      guestEmail = email(declaredEmail);
      limiter.consume(SupportLimits.SUBMIT_BY_GUEST, guestEmail);
    }
    String email = guestEmail;
    String snapshotJson = json.writeValueAsString((snapshot == null ? Snapshot.EMPTY : snapshot).scrubbed());
    String journalJson = journalJson(journal);
    UUID id = UUID.randomUUID();
    Instant now = clock.instant();
    long number = Objects.requireNonNull(transactions.execute(status -> {
      long assigned = requests.insert(id, author.orElse(null), email, locale.toLanguageTag(), message, snapshotJson, journalJson, now);
      for (int index = 0; index < attached.size(); index++) {
        Upload upload = attached.get(index);
        UUID file = UUID.randomUUID();
        requests.attachment(file, id, name(upload.name()), types.get(index), upload.size(), now);
        files.put(file, upload.content(), types.get(index));
      }
      afterCommit(() -> letters.arrived(new ArrivalNotice(id, assigned, settings.operator(id), true)), assigned);
      // REQ-SUPPORT-015
      bell.arrived(assigned, id);
      return assigned;
    }));
    return new Submitted(id, number);
  }

  Page mine(UUID author, int page, int size) {
    int bounded = bounded(size);
    int offset = Math.max(0, page) * bounded;
    List<Item> items = requests.pageByAuthor(author, offset, bounded).stream().map(SupportService::item).toList();
    return new Page(items, Math.max(0, page), bounded, requests.countByAuthor(author));
  }

  Page all(RequestState state, int page, int size) {
    int bounded = bounded(size);
    int offset = Math.max(0, page) * bounded;
    List<Item> items = requests.pageAll(state, offset, bounded).stream().map(SupportService::item).toList();
    return new Page(items, Math.max(0, page), bounded, requests.countAll(state));
  }

  // REQ-SUPPORT-012
  AuthorView authorView(UUID author, UUID id) {
    return authorView(own(author, id));
  }

  OperatorView operatorView(UUID id) {
    return operatorView(requests.find(id).orElseThrow(SupportService::missing));
  }

  // REQ-SUPPORT-007, REQ-SUPPORT-009
  AuthorView authorWrites(UUID author, UUID id, String declared) {
    limiter.consume(SupportLimits.MESSAGE_BY_ACCOUNT, author.toString());
    String text = text(declared);
    transactions.executeWithoutResult(status -> {
      Stored request = own(author, id);
      if (request.state() == RequestState.CLOSED) {
        throw new SupportRefused(SupportRefused.CLOSED, "Обращение закрыто");
      }
      Instant now = clock.instant();
      requests.entry(id, Kind.MESSAGE, Side.AUTHOR, author, text, null, null, now);
      move(request, request.state().afterAuthorMessage(), Side.AUTHOR, author, now);
      afterCommit(() -> letters.arrived(new ArrivalNotice(id, request.number(), settings.operator(id), false)), request.number());
      // REQ-SUPPORT-015
      bell.arrived(request.number(), id);
    });
    return authorView(author, id);
  }

  // REQ-SUPPORT-004, REQ-SUPPORT-007, REQ-SUPPORT-009
  OperatorView operatorWrites(UUID operator, UUID id, String declared) {
    String text = text(declared);
    transactions.executeWithoutResult(status -> {
      Stored request = visible(id);
      if (request.state() == RequestState.CLOSED) {
        throw new SupportRefused(SupportRefused.CLOSED, "Обращение закрыто: сначала откройте его снова");
      }
      Instant now = clock.instant();
      requests.entry(id, Kind.MESSAGE, Side.OPERATOR, operator, text, null, null, now);
      move(request, request.state().afterOperatorMessage(), Side.OPERATOR, operator, now);
      letter(request, text, now).ifPresent(letter -> afterCommit(() -> letters.answered(letter), request.number()));
      // REQ-SUPPORT-015
      if (request.author() != null) {
        bell.answered(request.author(), request.number(), id);
      }
    });
    return operatorView(id);
  }

  // REQ-SUPPORT-007
  OperatorView change(UUID operator, UUID id, RequestState to) {
    if (to == null) {
      throw new SupportRefused(SupportRefused.TRANSITION, "Состояние не названо");
    }
    transactions.executeWithoutResult(status -> {
      Stored request = visible(id);
      if (request.state() == to) {
        return;
      }
      if (!request.state().operatorMoves().contains(to)) {
        throw new SupportRefused(SupportRefused.TRANSITION, "Переход " + request.state() + " → " + to + " не разрешён");
      }
      move(request, to, Side.OPERATOR, operator, clock.instant());
    });
    return operatorView(id);
  }

  // REQ-SUPPORT-008
  void seenByAuthor(UUID author, UUID id) {
    own(author, id);
    requests.seenByAuthor(id, author, clock.instant());
  }

  // REQ-SUPPORT-008
  void seenByOperator(UUID id) {
    visible(id);
    requests.seenByOperator(id, clock.instant());
  }

  // REQ-SUPPORT-008
  Unread unread(UUID account, boolean operator) {
    return new Unread(requests.unreadByAuthor(account), operator ? requests.unreadByOperator() : null);
  }

  // REQ-SUPPORT-005, REQ-SUPPORT-012
  File file(Optional<UUID> author, UUID id, UUID attachment) {
    Stored request = author.isPresent() ? own(author.get(), id) : visible(id);
    return requests.attachments(request.id()).stream()
      .filter(one -> one.id().equals(attachment) && !one.purged())
      .findFirst()
      .map(one -> new File(one.id(), one.name(), one.type(), one.size(), false))
      .orElseThrow(() -> new SupportRefused(SupportRefused.ATTACHMENT_NOT_FOUND, "Вложения нет"));
  }

  byte[] content(UUID attachment) {
    return files.get(attachment).orElseThrow(() -> new SupportRefused(SupportRefused.ATTACHMENT_NOT_FOUND, "Вложения нет"));
  }

  // REQ-SUPPORT-004
  AuthorView answerView(String token, String address) {
    limiter.consume(SupportLimits.ANSWER_LINK_BY_ADDRESS, address);
    if (token == null || token.isBlank()) {
      throw new SupportRefused(SupportRefused.TOKEN, "Ссылка на ответ недействительна");
    }
    UUID id = requests.answerLinkRequest(Digest.of(token), clock.instant())
      .orElseThrow(() -> new SupportRefused(SupportRefused.TOKEN, "Ссылка на ответ недействительна или просрочена"));
    Stored request = requests.find(id).filter(found -> found.erasedAt() == null)
      .orElseThrow(() -> new SupportRefused(SupportRefused.TOKEN, "Ссылка на ответ недействительна"));
    return authorView(request);
  }

  // REQ-SUPPORT-004, REQ-SUPPORT-009
  private Optional<AnswerNotice> letter(Stored request, String text, Instant now) {
    Locale locale = Locale.forLanguageTag(request.locale());
    if (request.author() != null) {
      return accounts.find(request.author()).map(Account::email)
        .map(email -> new AnswerNotice(email, request.number(), settings.request(request.id()), Optional.of(text), locale));
    }
    if (request.guestEmail() == null) {
      return Optional.empty();
    }
    byte[] raw = new byte[32];
    RANDOM.nextBytes(raw);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    requests.answerLink(Digest.of(token), request.id(), now, now.plus(settings.answerLinkTtl()));
    return Optional.of(new AnswerNotice(request.guestEmail(), request.number(), settings.answer(token), Optional.empty(), locale));
  }

  // REQ-SUPPORT-007
  private void move(Stored request, RequestState to, Side side, UUID actor, Instant now) {
    boolean operator = side == Side.OPERATOR;
    if (to == request.state()) {
      requests.touch(request.id(), operator, now);
      return;
    }
    if (!requests.move(request.id(), request.state(), to, operator, now)) {
      throw new SupportRefused(SupportRefused.CHANGED, "Обращение изменилось, пока шёл запрос");
    }
    requests.entry(request.id(), Kind.STATE, side, actor, null, request.state(), to, now);
  }

  private Stored own(UUID author, UUID id) {
    return requests.find(id).filter(found -> author.equals(found.author()) && found.erasedAt() == null)
      .orElseThrow(SupportService::missing);
  }

  private Stored visible(UUID id) {
    return requests.find(id).filter(found -> found.erasedAt() == null).orElseThrow(SupportService::missing);
  }

  private static SupportRefused missing() {
    return new SupportRefused(SupportRefused.NOT_FOUND, "Обращения нет");
  }

  // REQ-SUPPORT-012
  private AuthorView authorView(Stored request) {
    List<Step> steps = requests.entries(request.id()).stream()
      .map(entry -> new Step(entry.kind().name(), entry.side().name(), entry.text(), entry.from(), entry.to(), entry.at()))
      .toList();
    return new AuthorView(request.id(), request.number(), request.state(), request.message(), request.createdAt(),
      request.updatedAt(), steps, files(request));
  }

  // REQ-SUPPORT-012
  private OperatorView operatorView(Stored request) {
    List<OperatorStep> steps = requests.entries(request.id()).stream()
      .map(entry -> new OperatorStep(entry.kind().name(), entry.side().name(), entry.actor(), entry.text(), entry.from(), entry.to(),
        entry.at()))
      .toList();
    String email = request.author() == null ? request.guestEmail()
      : accounts.find(request.author()).map(Account::email).orElse(null);
    return new OperatorView(request.id(), request.number(), request.state(), request.message(), request.createdAt(),
      request.updatedAt(), request.closedAt(), request.author(), email, request.guest(), read(request.snapshot(), Snapshot.class),
      journalOf(request.journal()), steps, files(request), request.attachmentsExpiredAt() != null,
      request.journalExpiredAt() != null, request.emailExpiredAt() != null, request.erasedAt() != null);
  }

  private List<File> files(Stored request) {
    return requests.attachments(request.id()).stream()
      .map(one -> new File(one.id(), one.name(), one.type(), one.size(), one.purged()))
      .toList();
  }

  private static Item item(RequestStore.Listed listed) {
    String message = listed.message();
    String excerpt = message == null || message.length() <= SupportLimits.EXCERPT_CHARS ? message
      : message.substring(0, SupportLimits.EXCERPT_CHARS) + "…";
    return new Item(listed.id(), listed.number(), listed.state(), excerpt, listed.createdAt(), listed.updatedAt(), listed.fresh(),
      listed.guest());
  }

  // REQ-SUPPORT-006
  private String journalJson(List<JournalEntry> journal) {
    List<JournalEntry> kept = new ArrayList<>();
    if (journal != null) {
      journal.stream().filter(Objects::nonNull).filter(JournalEntry::known).map(JournalEntry::scrubbed).forEach(kept::add);
    }
    while (kept.size() > SupportLimits.JOURNAL_ENTRIES) {
      kept.removeFirst();
    }
    String written = json.writeValueAsString(kept);
    while (!kept.isEmpty() && written.getBytes(StandardCharsets.UTF_8).length > SupportLimits.JOURNAL_BYTES) {
      kept.subList(0, Math.max(1, kept.size() / 10)).clear();
      written = json.writeValueAsString(kept);
    }
    return written;
  }

  private List<JournalEntry> journalOf(String stored) {
    if (stored == null) {
      return null;
    }
    return json.readValue(stored, new TypeReference<List<JournalEntry>>() { });
  }

  private <T> T read(String stored, Class<T> type) {
    return stored == null ? null : json.readValue(stored, type);
  }

  // REQ-SUPPORT-005
  private static String imageType(Upload upload) {
    if (upload.size() > SupportLimits.ATTACHMENT_BYTES) {
      throw new SupportRefused(SupportRefused.ATTACHMENT, "Вложение больше " + SupportLimits.ATTACHMENT_BYTES + " байт");
    }
    if (upload.starts(PNG)) {
      return "image/png";
    }
    if (upload.starts(JPEG)) {
      return "image/jpeg";
    }
    throw new SupportRefused(SupportRefused.ATTACHMENT, "Вложение — не PNG и не JPEG по содержимому");
  }

  private static String name(String declared) {
    String base = declared == null || declared.isBlank() ? "attachment" : declared.replaceAll("[\\\\/\\p{Cntrl}]", "_");
    return Masking.cut(Masking.masked(base), SupportLimits.NAME_CHARS);
  }

  private static String text(String declared) {
    String text = declared == null ? "" : declared.strip();
    if (text.isEmpty() || text.length() > SupportLimits.MESSAGE_CHARS) {
      throw new SupportRefused(SupportRefused.MESSAGE, "Текст — от 1 до " + SupportLimits.MESSAGE_CHARS + " знаков");
    }
    return text;
  }

  private static String email(String declared) {
    String email = declared == null ? "" : declared.strip().toLowerCase(Locale.ROOT);
    if (email.length() > 320 || !EMAIL.matcher(email).matches()) {
      throw new SupportRefused(SupportRefused.EMAIL, "Почта для ответа обязательна без входа");
    }
    return email;
  }

  private static int bounded(int size) {
    return size < 1 ? SupportLimits.PAGE_SIZE : Math.min(size, SupportLimits.PAGE_SIZE_MAX);
  }

  // REQ-SUPPORT-009
  private static void afterCommit(Runnable letter, long number) {
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
      @Override
      public void afterCommit() {
        try {
          letter.run();
        } catch (RuntimeException failure) {
          LOG.warn("Письмо центра поддержки не ушло: обращение {}, {}", number, failure.getClass().getSimpleName());
        }
      }
    });
  }
}
