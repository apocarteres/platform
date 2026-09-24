UPDATE platform_support_request
SET message = NULL, snapshot = NULL, journal = NULL, guest_email = NULL, author_account = NULL, erased_at = :now
WHERE id = :id AND erased_at IS NULL
