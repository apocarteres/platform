UPDATE platform_support_request
SET state = :to, updated_at = :now,
  closed_at = CASE WHEN :to = 'CLOSED' THEN :now ELSE NULL END,
  operator_acted_at = CASE WHEN :operator THEN :now ELSE operator_acted_at END,
  author_acted_at = CASE WHEN :operator THEN author_acted_at ELSE :now END
WHERE id = :id AND state = :from AND erased_at IS NULL
