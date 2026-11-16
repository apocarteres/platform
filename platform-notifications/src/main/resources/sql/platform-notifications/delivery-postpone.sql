UPDATE platform_notification_delivery SET attempts = :attempts, due_at = :due, claimed_until = NULL WHERE id = :id
