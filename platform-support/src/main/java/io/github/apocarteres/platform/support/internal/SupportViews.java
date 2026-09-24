package io.github.apocarteres.platform.support.internal;

import io.github.apocarteres.platform.support.RequestState;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// REQ-SUPPORT-001, REQ-SUPPORT-008, REQ-SUPPORT-012
final class SupportViews {

  record Submission(String message, String email, Snapshot snapshot, List<JournalEntry> journal) {
  }

  record Submitted(UUID id, long number) {
  }

  record Message(String text) {
  }

  record StateChange(RequestState state) {
  }

  record AnswerLink(String token) {
  }

  record Item(UUID id, long number, RequestState state, String excerpt, Instant createdAt, Instant updatedAt, boolean fresh,
    boolean guest) {
  }

  record Page(List<Item> items, int page, int size, long total) {
  }

  record Step(String kind, String side, String text, RequestState from, RequestState to, Instant at) {
  }

  record OperatorStep(String kind, String side, UUID actor, String text, RequestState from, RequestState to, Instant at) {
  }

  record File(UUID id, String name, String type, int size, boolean purged) {
  }

  record AuthorView(UUID id, long number, RequestState state, String message, Instant createdAt, Instant updatedAt,
    List<Step> steps, List<File> files) {
  }

  record OperatorView(UUID id, long number, RequestState state, String message, Instant createdAt, Instant updatedAt,
    Instant closedAt, UUID author, String email, boolean guest, Snapshot snapshot, List<JournalEntry> journal,
    List<OperatorStep> steps, List<File> files, boolean attachmentsExpired, boolean journalExpired, boolean emailExpired,
    boolean erased) {
  }

  record Unread(long mine, Long operator) {
  }

  record Policy(int messageChars, int attachments, int attachmentBytes, List<String> attachmentTypes, boolean guestIntake) {
  }

  private SupportViews() {
  }
}
