UPDATE platform_job_lock
SET held_until = :now
WHERE name = :name AND holder = :holder
