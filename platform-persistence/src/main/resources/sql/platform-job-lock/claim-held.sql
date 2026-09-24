UPDATE platform_job_lock
SET holder = :holder, held_until = :until
WHERE name = :name AND (held_until <= :now OR holder = :holder)
