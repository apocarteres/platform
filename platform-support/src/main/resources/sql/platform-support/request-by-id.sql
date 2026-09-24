SELECT id, number, author_account, guest_email, locale, message, snapshot, journal, state, created_at, updated_at,
  closed_at, author_acted_at, operator_acted_at, author_seen_at, operator_seen_at, attachments_expired_at,
  journal_expired_at, email_expired_at, erased_at
FROM platform_support_request
WHERE id = :id
