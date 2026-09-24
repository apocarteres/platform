package io.github.apocarteres.platform.support.internal;

import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.CurrentAccount;
import io.github.apocarteres.platform.support.GuestIntake;
import io.github.apocarteres.platform.support.RequestState;
import io.github.apocarteres.platform.support.SupportRefused;
import io.github.apocarteres.platform.support.internal.SupportService.Upload;
import io.github.apocarteres.platform.support.internal.SupportViews.AnswerLink;
import io.github.apocarteres.platform.support.internal.SupportViews.AuthorView;
import io.github.apocarteres.platform.support.internal.SupportViews.File;
import io.github.apocarteres.platform.support.internal.SupportViews.Message;
import io.github.apocarteres.platform.support.internal.SupportViews.OperatorView;
import io.github.apocarteres.platform.support.internal.SupportViews.Page;
import io.github.apocarteres.platform.support.internal.SupportViews.Policy;
import io.github.apocarteres.platform.support.internal.SupportViews.StateChange;
import io.github.apocarteres.platform.support.internal.SupportViews.Submission;
import io.github.apocarteres.platform.support.internal.SupportViews.Submitted;
import io.github.apocarteres.platform.support.internal.SupportViews.Unread;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

// REQ-SUPPORT-001, REQ-SUPPORT-004, REQ-SUPPORT-007, REQ-SUPPORT-008, REQ-SUPPORT-012
@RestController
@RequestMapping("/api/support")
class SupportController {

  private final SupportService support;
  private final GuestIntake intake;
  private final SupportSettings settings;

  SupportController(SupportService support, GuestIntake intake, SupportSettings settings) {
    this.support = support;
    this.intake = intake;
    this.settings = settings;
  }

  // REQ-SUPPORT-001, REQ-SUPPORT-002
  @PostMapping(path = "/requests", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  ResponseEntity<Submitted> submit(@RequestPart("request") Submission body,
    @RequestPart(name = "files", required = false) List<MultipartFile> files, HttpServletRequest request) {
    Optional<UUID> author = CurrentAccount.id();
    boolean guestAccepted = author.isEmpty() && intake.accepts(request);
    Submitted submitted = support.submit(author, guestAccepted, body.email(), body.message(), body.snapshot(), body.journal(),
      uploads(files), request.getLocale());
    return ResponseEntity.status(HttpStatus.CREATED).body(submitted);
  }

  // REQ-SUPPORT-002
  @GetMapping("/policy")
  Policy policy(HttpServletRequest request) {
    return new Policy(SupportLimits.MESSAGE_CHARS, SupportLimits.ATTACHMENTS, SupportLimits.ATTACHMENT_BYTES,
      List.copyOf(new TreeSet<>(SupportLimits.IMAGE_TYPES)), intake.accepts(request));
  }

  @GetMapping("/requests")
  Page mine(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
    return support.mine(signedIn(), page, size);
  }

  // REQ-SUPPORT-012
  @GetMapping("/requests/{id}")
  AuthorView request(@PathVariable UUID id) {
    return support.authorView(signedIn(), id);
  }

  @PostMapping("/requests/{id}/messages")
  AuthorView write(@PathVariable UUID id, @RequestBody Message body) {
    return support.authorWrites(signedIn(), id, body.text());
  }

  // REQ-SUPPORT-008
  @PostMapping("/requests/{id}/seen")
  ResponseEntity<Void> seen(@PathVariable UUID id) {
    support.seenByAuthor(signedIn(), id);
    return ResponseEntity.noContent().build();
  }

  // REQ-SUPPORT-005, REQ-SUPPORT-012
  @GetMapping("/requests/{id}/files/{file}")
  ResponseEntity<byte[]> file(@PathVariable UUID id, @PathVariable UUID file) {
    return download(support.file(Optional.of(signedIn()), id, file));
  }

  // REQ-SUPPORT-008
  @GetMapping("/unread")
  Unread unread() {
    boolean operator = SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
      .anyMatch(granted -> ("ROLE_" + settings.operatorRole()).equals(granted.getAuthority()));
    return support.unread(signedIn(), operator);
  }

  // REQ-SUPPORT-004
  @PostMapping("/answer")
  AuthorView answer(@RequestBody AnswerLink body, HttpServletRequest request) {
    return support.answerView(body.token(), request.getRemoteAddr());
  }

  @GetMapping("/operator/requests")
  Page all(@RequestParam(required = false) RequestState state, @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "20") int size) {
    return support.all(state, page, size);
  }

  // REQ-SUPPORT-012
  @GetMapping("/operator/requests/{id}")
  OperatorView operatorRequest(@PathVariable UUID id) {
    return support.operatorView(id);
  }

  @PostMapping("/operator/requests/{id}/messages")
  OperatorView answerRequest(@PathVariable UUID id, @RequestBody Message body) {
    return support.operatorWrites(signedIn(), id, body.text());
  }

  // REQ-SUPPORT-007
  @PostMapping("/operator/requests/{id}/state")
  OperatorView change(@PathVariable UUID id, @RequestBody StateChange body) {
    return support.change(signedIn(), id, body.state());
  }

  // REQ-SUPPORT-008
  @PostMapping("/operator/requests/{id}/seen")
  ResponseEntity<Void> operatorSeen(@PathVariable UUID id) {
    support.seenByOperator(id);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/operator/requests/{id}/files/{file}")
  ResponseEntity<byte[]> operatorFile(@PathVariable UUID id, @PathVariable UUID file) {
    return download(support.file(Optional.empty(), id, file));
  }

  private ResponseEntity<byte[]> download(File file) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentDisposition(ContentDisposition.attachment().filename(file.name(), StandardCharsets.UTF_8).build());
    return ResponseEntity.ok().headers(headers).contentType(MediaType.parseMediaType(file.type())).body(support.content(file.id()));
  }

  private static UUID signedIn() {
    return CurrentAccount.id().orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Вход не выполнен"));
  }

  private static List<Upload> uploads(List<MultipartFile> files) {
    List<Upload> uploads = new ArrayList<>();
    if (files == null) {
      return uploads;
    }
    if (files.size() > SupportLimits.ATTACHMENTS) {
      throw new SupportRefused(SupportRefused.ATTACHMENT, "Вложений больше " + SupportLimits.ATTACHMENTS);
    }
    for (MultipartFile file : files) {
      if (file.getSize() > SupportLimits.ATTACHMENT_BYTES) {
        throw new SupportRefused(SupportRefused.ATTACHMENT, "Вложение больше " + SupportLimits.ATTACHMENT_BYTES + " байт");
      }
      try {
        uploads.add(new Upload(file.getOriginalFilename(), file.getBytes()));
      } catch (IOException failure) {
        throw new UncheckedIOException(failure);
      }
    }
    return uploads;
  }
}
