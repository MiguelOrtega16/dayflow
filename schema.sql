-- ============================================================
-- DayFlow — Complete Database Schema
-- Safe to run on fresh OR existing Supabase projects.
-- Every statement uses IF NOT EXISTS / DROP IF EXISTS so it
-- is idempotent: run it as many times as needed.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  username text unique,
  avatar_url text,
  bio text,
  color text not null default '#6366f1',
  email_notifications boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Idempotent column addition for existing deployments
alter table public.profiles add column if not exists email_notifications boolean not null default false;

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

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
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- SHARED CALENDARS  (before activities — RLS references it)
-- ============================================================
create table if not exists public.shared_calendars (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  shared_with_id uuid references public.profiles(id) on delete cascade not null,
  can_edit boolean default false not null,
  status text not null default 'accepted'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now() not null,
  unique(owner_id, shared_with_id)
);

-- Add status column if upgrading from older schema
alter table public.shared_calendars
  add column if not exists status text not null default 'accepted'
  check (status in ('pending', 'accepted', 'declined'));

alter table public.shared_calendars enable row level security;

drop policy if exists "Users can view their shared calendars" on public.shared_calendars;
create policy "Users can view their shared calendars"
  on public.shared_calendars for select to authenticated
  using (owner_id = auth.uid() or shared_with_id = auth.uid());

drop policy if exists "Users can create shares for their own calendar" on public.shared_calendars;
create policy "Users can create shares for their own calendar"
  on public.shared_calendars for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Recipients can respond to calendar shares" on public.shared_calendars;
create policy "Recipients can respond to calendar shares"
  on public.shared_calendars for update to authenticated
  using (shared_with_id = auth.uid() or owner_id = auth.uid());

drop policy if exists "Users can delete their own shares" on public.shared_calendars;
create policy "Users can delete their own shares"
  on public.shared_calendars for delete to authenticated
  using (owner_id = auth.uid());

-- ============================================================
-- GOALS  (before activities — activities.goal_id references it)
-- ============================================================
create table if not exists public.goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  emoji text,
  color text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'blocked', 'skipped')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  target_date date,
  is_public boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists goals_user_id_idx on public.goals(user_id);

alter table public.goals enable row level security;

drop policy if exists "Users can view own goals" on public.goals;
create policy "Users can view own goals"
  on public.goals for select to authenticated
  using (
    user_id = auth.uid()
    or (
      is_public = true
      and exists (
        select 1 from public.shared_calendars sc
        where sc.shared_with_id = auth.uid()
          and sc.owner_id = goals.user_id
          and sc.status = 'accepted'
      )
    )
  );

drop policy if exists "Users can insert own goals" on public.goals;
create policy "Users can insert own goals"
  on public.goals for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Users can update own goals" on public.goals;
create policy "Users can update own goals"
  on public.goals for update to authenticated using (user_id = auth.uid());

drop policy if exists "Users can delete own goals" on public.goals;
create policy "Users can delete own goals"
  on public.goals for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- ACTIVITIES
-- ============================================================
create table if not exists public.activities (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  goal_id uuid references public.goals(id) on delete set null,
  invited_from_activity_id uuid,   -- set after creation via FK below
  title text not null,
  description text,
  date date not null,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'blocked', 'skipped')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  category text not null default 'task'
    check (category in ('task', 'habit', 'event', 'note')),
  tags text[] default '{}',
  color text,
  emoji text,
  start_time time,
  end_time time,
  recurrence_type text not null default 'none'
    check (recurrence_type in ('none', 'daily', 'weekly', 'monthly', 'weekdays', 'custom')),
  recurrence_config jsonb,
  parent_activity_id uuid references public.activities(id) on delete set null,
  is_public boolean default true not null,
  notes text,
  completion_percentage integer default 0
    check (completion_percentage >= 0 and completion_percentage <= 100),
  evidence_image_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Self-referential FK for invited activities (must be added after table creation)
alter table public.activities
  drop constraint if exists activities_invited_from_activity_id_fkey;
alter table public.activities
  add constraint activities_invited_from_activity_id_fkey
  foreign key (invited_from_activity_id) references public.activities(id) on delete set null;

-- Upgrade path: add new columns to existing tables
alter table public.activities add column if not exists invited_from_activity_id uuid;
alter table public.activities add column if not exists evidence_image_url text;

create index if not exists activities_user_id_idx    on public.activities(user_id);
create index if not exists activities_date_idx        on public.activities(date);
create index if not exists activities_user_date_idx   on public.activities(user_id, date);
create index if not exists activities_status_idx      on public.activities(status);

alter table public.activities enable row level security;

drop policy if exists "Users can view own activities" on public.activities;
create policy "Users can view own activities"
  on public.activities for select to authenticated
  using (
    user_id = auth.uid()
    or (
      is_public = true
      and exists (
        select 1 from public.shared_calendars sc
        where sc.shared_with_id = auth.uid()
          and sc.owner_id = activities.user_id
          and sc.status = 'accepted'
      )
    )
  );

drop policy if exists "Users can insert own activities" on public.activities;
create policy "Users can insert own activities"
  on public.activities for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own activities" on public.activities;
create policy "Users can update own activities"
  on public.activities for update to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can delete own activities" on public.activities;
create policy "Users can delete own activities"
  on public.activities for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- ACTIVITY INVITATIONS
-- ============================================================
create table if not exists public.activity_invitations (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities(id) on delete cascade not null,
  inviter_id  uuid references public.profiles(id)   on delete cascade not null,
  invitee_id  uuid references public.profiles(id)   on delete cascade not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz default now() not null,
  responded_at timestamptz,
  unique(activity_id, invitee_id)
);

create index if not exists act_inv_activity_idx on public.activity_invitations(activity_id);
create index if not exists act_inv_invitee_idx  on public.activity_invitations(invitee_id);
create index if not exists act_inv_inviter_idx  on public.activity_invitations(inviter_id);

alter table public.activity_invitations enable row level security;

drop policy if exists "See own activity invitations" on public.activity_invitations;
create policy "See own activity invitations"
  on public.activity_invitations for select to authenticated
  using (invitee_id = auth.uid() or inviter_id = auth.uid());

drop policy if exists "Create activity invitations" on public.activity_invitations;
create policy "Create activity invitations"
  on public.activity_invitations for insert to authenticated
  with check (inviter_id = auth.uid());

drop policy if exists "Respond to activity invitations" on public.activity_invitations;
create policy "Respond to activity invitations"
  on public.activity_invitations for update to authenticated
  using (invitee_id = auth.uid());

drop policy if exists "Cancel activity invitations" on public.activity_invitations;
create policy "Cancel activity invitations"
  on public.activity_invitations for delete to authenticated
  using (inviter_id = auth.uid());

-- ============================================================
-- ACTIVITY COMMENTS
-- ============================================================
create table if not exists public.activity_comments (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.activity_comments enable row level security;

drop policy if exists "Comments visible if activity is visible" on public.activity_comments;
create policy "Comments visible if activity is visible"
  on public.activity_comments for select to authenticated
  using (
    exists (
      select 1 from public.activities a
      where a.id = activity_id
        and (
          a.user_id = auth.uid()
          or a.is_public = true
          or exists (
            select 1 from public.shared_calendars sc
            where sc.shared_with_id = auth.uid()
              and sc.owner_id = a.user_id
              and sc.status = 'accepted'
          )
        )
    )
  );

drop policy if exists "Authenticated users can comment on visible activities" on public.activity_comments;
create policy "Authenticated users can comment on visible activities"
  on public.activity_comments for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own comments" on public.activity_comments;
create policy "Users can update own comments"
  on public.activity_comments for update to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can delete own comments" on public.activity_comments;
create policy "Users can delete own comments"
  on public.activity_comments for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table if not exists public.notifications (
  id uuid default uuid_generate_v4() primary key,
  recipient_id uuid references public.profiles(id) on delete cascade not null,
  actor_id     uuid references public.profiles(id) on delete cascade not null,
  type text not null,
  activity_id  uuid references public.activities(id) on delete cascade,
  goal_id      uuid references public.goals(id)      on delete cascade,
  message text not null,
  is_read boolean default false not null,
  created_at timestamptz default now() not null
);

-- Update the type constraint to include all notification types (idempotent via DO block)
do $$
declare
  v_con text;
begin
  select conname into v_con
  from pg_constraint c
  join pg_class t on c.conrelid = t.oid
  join pg_namespace n on t.relnamespace = n.oid
  where n.nspname = 'public' and t.relname = 'notifications' and c.contype = 'c';

  if v_con is not null then
    execute format('alter table public.notifications drop constraint %I', v_con);
  end if;
exception when others then null;
end $$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'status_update', 'task_completed', 'goal_completed', 'goal_progress', 'new_activity',
    'activity_invitation', 'invitation_accepted', 'invitation_declined',
    'calendar_share_invite', 'calendar_share_accepted', 'calendar_share_declined'
  ));

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_id, is_read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
  on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "Authenticated users can insert notifications" on public.notifications;
create policy "Authenticated users can insert notifications"
  on public.notifications for insert to authenticated
  with check (actor_id = auth.uid());

drop policy if exists "Users can mark own notifications read" on public.notifications;
create policy "Users can mark own notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications"
  on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());

-- ============================================================
-- TRIGGERS — updated_at
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists handle_updated_at on public.profiles;
create trigger handle_updated_at before update on public.profiles
  for each row execute procedure public.handle_updated_at();

drop trigger if exists handle_updated_at on public.goals;
create trigger handle_updated_at before update on public.goals
  for each row execute procedure public.handle_updated_at();

drop trigger if exists handle_updated_at on public.activities;
create trigger handle_updated_at before update on public.activities
  for each row execute procedure public.handle_updated_at();

drop trigger if exists handle_updated_at on public.activity_comments;
create trigger handle_updated_at before update on public.activity_comments
  for each row execute procedure public.handle_updated_at();

-- ============================================================
-- NOTIFICATION TRIGGERS
-- ============================================================
create or replace function public.notify_on_activity_change()
returns trigger as $$
declare
  shared_user record;
  actor_name text;
  notif_type text;
  notif_message text;
begin
  if (tg_op = 'UPDATE' and old.status = new.status) then
    return new;
  end if;

  select coalesce(full_name, email) into actor_name
  from public.profiles where id = new.user_id;

  if tg_op = 'INSERT' then
    notif_type    := 'new_activity';
    notif_message := actor_name || ' agregó una nueva actividad: ' || new.title;
  elsif new.status = 'done' then
    notif_type    := 'task_completed';
    notif_message := actor_name || ' completó: ' || new.title;
  else
    notif_type    := 'status_update';
    notif_message := actor_name || ' actualizó "' || new.title || '" a ' || replace(new.status, '_', ' ');
  end if;

  for shared_user in
    select shared_with_id
    from public.shared_calendars
    where owner_id = new.user_id and status = 'accepted'
  loop
    insert into public.notifications (recipient_id, actor_id, type, activity_id, goal_id, message)
    values (shared_user.shared_with_id, new.user_id, notif_type, new.id, new.goal_id, notif_message);
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_activity_changed on public.activities;
create trigger on_activity_changed
  after insert or update on public.activities
  for each row
  when (new.is_public = true)
  execute procedure public.notify_on_activity_change();

create or replace function public.notify_on_goal_change()
returns trigger as $$
declare
  shared_user record;
  actor_name text;
  notif_message text;
begin
  if (tg_op = 'UPDATE' and old.status = new.status) then
    return new;
  end if;

  select coalesce(full_name, email) into actor_name
  from public.profiles where id = new.user_id;

  if new.status = 'done' then
    notif_message := '🎯 ' || actor_name || ' logró su meta: ' || new.title;
  else
    notif_message := actor_name || ' actualizó la meta "' || new.title || '" a ' || replace(new.status, '_', ' ');
  end if;

  for shared_user in
    select shared_with_id
    from public.shared_calendars
    where owner_id = new.user_id and status = 'accepted'
  loop
    insert into public.notifications (recipient_id, actor_id, type, goal_id, message)
    values (shared_user.shared_with_id, new.user_id, 'goal_completed', new.id, notif_message);
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_goal_changed on public.goals;
create trigger on_goal_changed
  after insert or update on public.goals
  for each row
  when (new.is_public = true)
  execute procedure public.notify_on_goal_change();

-- ============================================================
-- REALTIME
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.activities;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.goals;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.activity_comments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.shared_calendars;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.activity_invitations;
exception when duplicate_object then null; end $$;

-- ============================================================
-- ROLE GRANTS
-- ============================================================
grant usage on schema public to anon, authenticated;

grant select              on public.profiles              to anon, authenticated;
grant insert, update      on public.profiles              to authenticated;
grant select, insert, update, delete on public.goals               to authenticated;
grant select, insert, update, delete on public.activities           to authenticated;
grant select, insert, delete         on public.shared_calendars     to authenticated;
grant select, insert, update, delete on public.notifications        to authenticated;
grant select, insert, update, delete on public.activity_comments    to authenticated;
grant select, insert, update, delete on public.activity_invitations to authenticated;

grant usage on all sequences in schema public to authenticated;

-- ============================================================
-- STORAGE BUCKET FOR EVIDENCE IMAGES
-- Create manually in: Supabase Dashboard → Storage → New bucket
--   Name: activity-evidence
--   Public: ON
-- Or run this if you have service-role access:
-- insert into storage.buckets (id, name, public)
--   values ('activity-evidence', 'activity-evidence', true)
--   on conflict (id) do nothing;
-- ============================================================
