ALTER TABLE public.photographers
  ADD COLUMN biography TEXT,
  ADD COLUMN phone_number TEXT,
  ADD COLUMN website_url TEXT,
  ADD COLUMN social_links TEXT,
  ADD COLUMN profile_image_url TEXT,
  ADD COLUMN cover_image_url TEXT,
  ADD COLUMN cpf TEXT,
  ADD COLUMN accepted_terms BOOLEAN NOT NULL DEFAULT FALSE;
