select exists(select 1 from players where email = :email)
