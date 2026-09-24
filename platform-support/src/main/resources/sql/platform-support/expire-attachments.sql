UPDATE platform_support_request SET attachments_expired_at = :now
WHERE state = 'CLOSED' AND closed_at < :before AND attachments_expired_at IS NULL AND erased_at IS NULL
RETURNING id
