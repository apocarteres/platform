UPDATE platform_support_attachment SET purged_at = :now WHERE id = :id AND purged_at IS NULL
