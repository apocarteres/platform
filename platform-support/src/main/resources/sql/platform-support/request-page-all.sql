SELECT id, number, state, message, created_at, updated_at, author_account, guest_email, erased_at,
  operator_seen_at IS NULL OR author_acted_at > operator_seen_at AS fresh
FROM platform_support_request
WHERE CAST(:state AS VARCHAR) IS NULL OR state = CAST(:state AS VARCHAR)
ORDER BY created_at DESC, number DESC
LIMIT :limit OFFSET :offset
