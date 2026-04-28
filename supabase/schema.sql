-- ============================================================
-- DayFlow Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES TABLE
-- ============================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  username text unique,
  avatar_url text,
  bio text,
  color text not null default '#6366f1',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS
alter table public.profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, color)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    '#' || lpad(to_hex(floor(random() * 16777215)::int), 6, '0')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ACTIVITIES TABLE
-- ============================================================
create table public.activities (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  date date not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'blocked', 'skipped')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  category text not null default 'task' check (category in ('goal', 'task', 'habit', 'event', 'note')),
  tags text[] default '{}',
  color text,
  emoji text,
  start_time time,
  end_time time,
  recurrence_type text not null default 'none' check (recurrence_type in ('none', 'daily', 'weekly', 'monthly', 'weekdays', 'custom')),
  recurrence_config jsonb,
  parent_activity_id uuid references public.activities(id) on delete set null,
  is_public boolean default true not null,
  notes text,
  completion_percentage integer default 0 check (completion_percentage >= 0 and completion_percentage <= 100),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index activities_user_id_idx on public.activities(user_id);
create index activities_date_idx on public.activities(date);
create index activities_user_date_idx on public.activities(user_id, date);
create index activities_status_idx on public.activities(status);

-- RLS
alter table public.activities enable row level security;

create policy "Users can view own activities"
  on public.activities for select
  to authenticated
  using (
    user_id = auth.uid()
    or is_public = true
    or exists (
      select 1 from public.shared_calendars sc
      where sc.shared_with_id = auth.uid()
      and sc.owner_id = activities.user_id
    )
  );

create policy "Users can insert own activities"
  on public.activities for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own activities"
  on public.activities for update
  to authenticated
  using (user_id = auth.uid());

create policy "Users can delete own activities"
  on public.activities for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- SHARED CALENDARS TABLE
-- ============================================================
create table public.shared_calendars (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  shared_with_id uuid references public.profiles(id) on delete cascade not null,
  can_edit boolean default false not null,
  created_at timestamptz default now() not null,
  unique(owner_id, shared_with_id)
);

alter table public.shared_calendars enable row level security;

create policy "Users can view their shared calendars"
  on public.shared_calendars for select
  to authenticated
  using (owner_id = auth.uid() or shared_with_id = auth.uid());

create policy "Users can create shares for their own calendar"
  on public.shared_calendars for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Users can delete their own shares"
  on public.shared_calendars for delete
  to authenticated
  using (owner_id = auth.uid());

-- ============================================================
-- ACTIVITY COMMENTS TABLE
-- ============================================================
create table public.activity_comments (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.activity_comments enable row level security;

create policy "Comments visible if activity is visible"
  on public.activity_comments for select
  to authenticated
  using (
    exists (
      select 1 from public.activities a
      where a.id = activity_id
      and (
        a.user_id = auth.uid()
        or a.is_public = true
        or exists (
          select 1 from public.shared_calendars sc
          where sc.shared_with_id = auth.uid() and sc.owner_id = a.user_id
        )
      )
    )
  );

create policy "Authenticated users can comment on visible activities"
  on public.activity_comments for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own comments"
  on public.activity_comments for update
  to authenticated
  using (user_id = auth.uid());

create policy "Users can delete own comments"
  on public.activity_comments for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger handle_updated_at before update on public.profiles
  for each row execute procedure public.handle_updated_at();
create trigger handle_updated_at before update on public.activities
  for each row execute procedure public.handle_updated_at();
create trigger handle_updated_at before update on public.activity_comments
  for each row execute procedure public.handle_updated_at();

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.activities;
alter publication supabase_realtime add table public.activity_comments;
alter publication supabase_realtime add table public.shared_calendars;
