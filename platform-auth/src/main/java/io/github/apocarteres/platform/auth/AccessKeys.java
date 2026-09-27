package io.github.apocarteres.platform.auth;

import java.util.List;
import java.util.UUID;

// REQ-AUTH-029
public interface AccessKeys {

  IssuedKey issue(UUID account, String name, int days);

  List<AccessKey> list(UUID account);

  boolean revoke(UUID account, UUID key);

  int revokeAll(UUID account);
}
