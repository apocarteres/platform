UPDATE platform_support_request SET guest_email = NULL, email_expired_at = :now
WHERE state = 'CLOSED' AND closed_at < :before AND guest_email IS NOT NULL AND erased_at IS NULL
RETURNING id
