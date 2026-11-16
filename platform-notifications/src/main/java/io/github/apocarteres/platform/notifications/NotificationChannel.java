package io.github.apocarteres.platform.notifications;

// REQ-NOTIFICATIONS-011
public interface NotificationChannel {

  String name();

  Delivery deliver(DeliveryNotice notice);
}
