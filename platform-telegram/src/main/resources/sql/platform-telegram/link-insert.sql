INSERT INTO platform_telegram_link (account_id, telegram_user, chat_id, linked_at) VALUES (:account, :user, :chat, :now) ON CONFLICT DO NOTHING
