SELECT COUNT(*) FROM platform_support_request
WHERE author_account = :author AND erased_at IS NULL
  AND operator_acted_at IS NOT NULL AND operator_acted_at > COALESCE(author_seen_at, '-infinity'::timestamptz)
