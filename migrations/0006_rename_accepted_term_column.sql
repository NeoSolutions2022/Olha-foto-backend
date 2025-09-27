DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'photographers'
      AND column_name = 'accepted_term'
  ) THEN
    ALTER TABLE public.photographers
      RENAME COLUMN accepted_term TO accepted_terms;
  END IF;
END;
$$;
