INSERT INTO platform_telegram_link (account_id, bot, telegram_user, chat_id, linked_at, language) VALUES (:account, :bot, :user, :chat, :now, :language) ON CONFLICT DO NOTHING
