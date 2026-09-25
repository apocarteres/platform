UPDATE platform_notification SET read_at = COALESCE(read_at, :now) WHERE id = :id AND account_id = :account
