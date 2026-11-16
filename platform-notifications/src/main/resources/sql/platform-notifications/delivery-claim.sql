UPDATE platform_notification_delivery AS d SET claimed_until = :until
FROM platform_notification AS n
WHERE n.id = d.notification_id AND d.id IN (
  SELECT id FROM platform_notification_delivery
  WHERE due_at <= :now AND (claimed_until IS NULL OR claimed_until <= :now)
  ORDER BY id LIMIT :limit FOR UPDATE SKIP LOCKED
)
RETURNING d.id, d.channel, d.attempts, n.id AS notification_id, n.account_id, n.kind, n.params, n.link, n.created_at, n.read_at
