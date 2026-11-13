SELECT id, params
FROM platform_notification
WHERE kind = :kind AND link = :link
ORDER BY seq
FOR UPDATE
