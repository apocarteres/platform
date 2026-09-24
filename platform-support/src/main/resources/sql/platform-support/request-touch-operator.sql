UPDATE platform_support_request SET operator_acted_at = :now, updated_at = :now WHERE id = :id AND erased_at IS NULL
