UPDATE platform_access_key SET last_used_at = :now WHERE id = :id AND (last_used_at IS NULL OR last_used_at <= :threshold)
