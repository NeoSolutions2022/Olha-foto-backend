DO $$
BEGIN
  CREATE TYPE public.event_status AS ENUM ('draft', 'scheduled', 'active', 'archived', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.event_visibility AS ENUM ('public', 'unlisted', 'private');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.event_highlight_type AS ENUM ('banner', 'reel', 'story');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.event_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_updated_at_event_categories ON public.event_categories;
CREATE TRIGGER set_updated_at_event_categories
BEFORE UPDATE ON public.event_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category_id UUID NOT NULL REFERENCES public.event_categories(id) ON DELETE RESTRICT,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  cover_url TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  timezone TEXT NOT NULL,
  venue_name TEXT,
  street TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  base_price_cents INTEGER,
  currency CHAR(3),
  policy TEXT,
  resolution TEXT,
  status public.event_status NOT NULL DEFAULT 'draft',
  visibility public.event_visibility NOT NULL DEFAULT 'private',
  max_participants INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS set_updated_at_events ON public.events;
CREATE TRIGGER set_updated_at_events
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_events_category_id ON public.events(category_id);
CREATE INDEX IF NOT EXISTS idx_events_owner_id ON public.events(owner_id);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON public.events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_visibility ON public.events(visibility);

CREATE TABLE IF NOT EXISTS public.event_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_event_tags_event_id ON public.event_tags(event_id);

CREATE TABLE IF NOT EXISTS public.event_highlights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  type public.event_highlight_type NOT NULL,
  asset_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_highlights_event_id ON public.event_highlights(event_id);
CREATE INDEX IF NOT EXISTS idx_event_highlights_sort_order ON public.event_highlights(event_id, sort_order);
