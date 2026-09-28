SELECT count(*) FROM platform_notification WHERE account_id = :account AND (:all OR read_at IS NULL)
