SELECT id, number, state, message, created_at, updated_at, author_account, guest_email, erased_at,
  operator_seen_at IS NULL OR author_acted_at > operator_seen_at AS fresh
FROM platform_support_request
WHERE state IN (:states)
ORDER BY CASE WHEN :activity THEN updated_at ELSE created_at END DESC, number DESC
LIMIT :limit OFFSET :offset
