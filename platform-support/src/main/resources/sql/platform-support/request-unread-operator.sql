SELECT COUNT(*) FROM platform_support_request
WHERE erased_at IS NULL AND (operator_seen_at IS NULL OR author_acted_at > operator_seen_at)
