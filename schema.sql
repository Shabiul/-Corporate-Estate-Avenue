-- Run in the Supabase SQL editor.
create table if not exists inquiries (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  phone text,
  service text,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists properties (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null,
  email text not null,
  property_type text not null,
  property_name text not null,
  property_location text not null,
  property_bhk text not null,
  property_price text not null,
  property_description text default '',
  images jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- The server uses the service-role key, which bypasses RLS. Enabling RLS with no
-- policies blocks everything else (e.g. the public anon key).
alter table inquiries enable row level security;
alter table properties enable row level security;

-- Storage: create a PUBLIC bucket named "property-images".
