CREATE TABLE platform_notification_delivery (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES platform_notification (id) ON DELETE CASCADE,
  channel VARCHAR(32) NOT NULL,
  attempts INTEGER NOT NULL,
  due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  claimed_until TIMESTAMP WITH TIME ZONE,
  UNIQUE (notification_id, channel)
);

CREATE INDEX platform_notification_delivery_due ON platform_notification_delivery (due_at);
