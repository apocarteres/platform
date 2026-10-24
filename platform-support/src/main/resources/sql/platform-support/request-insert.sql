INSERT INTO platform_support_request (id, number, author_account, guest_email, locale, message, snapshot, journal, state,
  created_at, updated_at, author_acted_at)
VALUES (:id, :number, :author, :email, :locale, :message, :snapshot, :journal, 'NEW', :now, :now, :now)
ON CONFLICT (number) DO NOTHING
