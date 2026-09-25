SELECT id, kind, params, link, created_at, read_at
FROM platform_notification
WHERE account_id = :account
ORDER BY seq DESC
LIMIT :limit
