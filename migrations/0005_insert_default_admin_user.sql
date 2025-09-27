DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  INSERT INTO public.users (
    id,
    email,
    password_hash,
    display_name,
    role,
    is_active,
    accepted_terms
  )
  VALUES (
    uuid_generate_v4(),
    'admin@admin.com',
    '$2b$10$IYdAdWGf.4eNnJ1zGwz4MOCwF1wSihrzl0DQTPwDg7sRla00y9hyG',
    'Admin',
    'admin',
    TRUE,
    TRUE
  )
  ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active,
    accepted_terms = EXCLUDED.accepted_terms
  RETURNING id INTO admin_user_id;

  IF admin_user_id IS NULL THEN
    SELECT id INTO admin_user_id FROM public.users WHERE email = 'admin@admin.com';
  END IF;

  INSERT INTO public.admins (user_id)
  VALUES (admin_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;
