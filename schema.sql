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
  listing_type text not null default 'Sale',
  cover_thumb text,
  status text not null default 'pending',
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- The server uses the service-role key, which bypasses RLS. Enabling RLS with no
-- policies blocks everything else (e.g. the public anon key).
alter table inquiries enable row level security;
alter table properties enable row level security;

-- Storage: create a PUBLIC bucket named "property-images".

-- Approval workflow: owner submissions start as 'pending' and only appear on the
-- public site once an admin approves them. (Safe to re-run; upgrades existing tables.)
alter table properties add column if not exists listing_type text not null default 'Sale';
alter table properties add column if not exists status text not null default 'pending';
alter table properties add column if not exists approved_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'properties_status_check') then
    alter table properties add constraint properties_status_check check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;
create index if not exists properties_status_idx on properties (status, approved_at desc);

-- Performance: small cover image for listing cards, and indexes for the admin lists
alter table properties add column if not exists cover_thumb text;
create index if not exists properties_created_idx on properties (created_at desc);
create index if not exists inquiries_created_idx on inquiries (created_at desc);

-- CRM: enquiry pipeline, follow-ups, notes and lead source; featured listings and admin notes
alter table inquiries add column if not exists status text not null default 'new';
alter table inquiries add column if not exists source text not null default 'website';
alter table inquiries add column if not exists notes text not null default '';
alter table inquiries add column if not exists follow_up_on date;
alter table inquiries add column if not exists updated_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inquiries_status_check') then
    alter table inquiries add constraint inquiries_status_check check (status in ('new', 'contacted', 'visit', 'negotiating', 'won', 'lost'));
  end if;
end $$;
create index if not exists inquiries_status_idx on inquiries (status);
alter table properties add column if not exists featured boolean not null default false;
alter table properties add column if not exists admin_notes text not null default '';

-- CRM v2: activity timeline per enquiry, and deal value / close date for revenue reporting
create table if not exists crm_activities (
  id bigint generated always as identity primary key,
  inquiry_id bigint not null references inquiries(id) on delete cascade,
  kind text not null default 'note',
  body text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_inquiry_idx on crm_activities (inquiry_id, created_at desc);
alter table crm_activities enable row level security;
alter table inquiries add column if not exists deal_kind text;
alter table inquiries add column if not exists deal_value numeric;
alter table inquiries add column if not exists closed_at timestamptz;
