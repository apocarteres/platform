SELECT id, number, state, message, created_at, updated_at, author_account, guest_email, erased_at,
  operator_acted_at IS NOT NULL AND operator_acted_at > COALESCE(author_seen_at, '-infinity'::timestamptz) AS fresh
FROM platform_support_request
WHERE author_account = :author AND erased_at IS NULL
ORDER BY created_at DESC, number DESC
LIMIT :limit OFFSET :offset
