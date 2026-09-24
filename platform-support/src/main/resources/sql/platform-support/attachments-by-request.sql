SELECT id, name, content_type, size_bytes, purged_at
FROM platform_support_attachment
WHERE request_id = :request
ORDER BY seq
