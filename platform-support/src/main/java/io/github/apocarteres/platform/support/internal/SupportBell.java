package io.github.apocarteres.platform.support.internal;

import java.util.UUID;

// REQ-SUPPORT-015, REQ-NOTIFICATIONS-007
interface SupportBell {

  SupportBell SILENT = new SupportBell() {
    @Override
    public void answered(UUID author, long number, UUID request) {
    }

    @Override
    public void arrived(long number, UUID request) {
    }
  };

  void answered(UUID author, long number, UUID request);

  void arrived(long number, UUID request);
}
