UPDATE platform_notification SET read_at = :now WHERE account_id = :account AND read_at IS NULL
