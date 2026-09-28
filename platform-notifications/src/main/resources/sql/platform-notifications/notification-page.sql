SELECT id, kind, params, link, created_at, read_at
FROM platform_notification
WHERE account_id = :account AND (:all OR read_at IS NULL)
ORDER BY seq DESC
LIMIT :size OFFSET :offset
