SELECT COUNT(*) FROM platform_support_request WHERE CAST(:state AS VARCHAR) IS NULL OR state = CAST(:state AS VARCHAR)
