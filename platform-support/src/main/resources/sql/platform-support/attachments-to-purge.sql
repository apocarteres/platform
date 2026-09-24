SELECT a.id
FROM platform_support_attachment a
JOIN platform_support_request r ON r.id = a.request_id
WHERE a.purged_at IS NULL AND (r.attachments_expired_at IS NOT NULL OR r.erased_at IS NOT NULL)
