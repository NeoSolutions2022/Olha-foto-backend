DO $$
DECLARE
  admin_id UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users WHERE email = 'marlon@admin.com'
  ) THEN
    RAISE NOTICE 'Default admin user already exists. Skipping insertion.';
  ELSE
    admin_id := uuid_generate_v4();

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
      admin_id,
      'marlon@admin.com',
      '$2b$10$Cmsf8I8SMldOJHGdpQqSa.Vuoq3t0B5lHbStJABadDCd8/uFj/hiG',
      'Marlon',
      'admin',
      TRUE,
      TRUE
    );

    INSERT INTO public.admins (user_id)
    VALUES (admin_id);
  END IF;
END;
$$;
