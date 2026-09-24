SELECT request_id FROM platform_support_answer_link WHERE digest = :digest AND expires_at > :now
