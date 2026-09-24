package io.github.apocarteres.platform.support;

import java.util.Optional;
import java.util.UUID;

// REQ-SUPPORT-005
public interface AttachmentStore {

  void put(UUID attachment, byte[] content, String contentType);

  Optional<byte[]> get(UUID attachment);

  void delete(UUID attachment);
}
