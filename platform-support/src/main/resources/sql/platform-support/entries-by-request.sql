SELECT kind, side, actor, text, from_state, to_state, created_at
FROM platform_support_entry
WHERE request_id = :request
ORDER BY seq
