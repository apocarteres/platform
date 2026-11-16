package io.github.apocarteres.platform.notifications;

// REQ-NOTIFICATIONS-013
public interface NotificationDelivery {

  DeliveryRun deliverPending();
}
