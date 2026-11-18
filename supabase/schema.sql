-- =====================================================================
-- Depong — Supabase schema
-- Jalankan seluruh file ini sekali di: Supabase Dashboard > SQL Editor
-- =====================================================================

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text not null,
  email text,
  avatar_url text,
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Otomatis buat profile saat user baru mendaftar
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
begin
  base_username := lower(
    regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
      '[^a-zA-Z0-9_]', '', 'g'
    )
  );
  if base_username = '' then
    base_username := 'user';
  end if;

  insert into public.profiles (id, username, display_name, email)
  values (
    new.id,
    base_username || '_' || substr(new.id::text, 1, 4),
    coalesce(new.raw_user_meta_data ->> 'display_name', base_username),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- FRIENDSHIPS (disimpan 2 arah) ----------
create table if not exists public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.friendships enable row level security;

drop policy if exists "users see own friendships" on public.friendships;
create policy "users see own friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users remove own friendships" on public.friendships;
create policy "users remove own friendships"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Tambah teman lewat kode undangan (otomatis saling berteman)
create or replace function public.add_friend_by_code(code text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles;
  friend_count int;
begin
  select * into target from public.profiles where invite_code = lower(trim(code));
  if target.id is null then
    raise exception 'Kode undangan tidak ditemukan';
  end if;
  if target.id = auth.uid() then
    raise exception 'Itu kode undangan kamu sendiri';
  end if;

  select count(*) into friend_count from public.friendships where user_id = auth.uid();
  if friend_count >= 20 then
    raise exception 'Maksimal 20 sahabat';
  end if;

  insert into public.friendships (user_id, friend_id) values (auth.uid(), target.id)
    on conflict do nothing;
  insert into public.friendships (user_id, friend_id) values (target.id, auth.uid())
    on conflict do nothing;

  return target;
end;
$$;

-- Hapus pertemanan dua arah
create or replace function public.remove_friend(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.friendships
  where (user_id = auth.uid() and friend_id = target)
     or (user_id = target and friend_id = auth.uid());
$$;

-- ---------- MOMENTS (foto / video 7 detik) ----------
create table if not exists public.moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  media_path text not null,
  media_type text not null check (media_type in ('photo', 'video')),
  duration numeric(4, 1) check (duration is null or duration <= 7.5),
  caption text check (char_length(caption) <= 60),
  created_at timestamptz not null default now()
);

create index if not exists moments_user_created_idx on public.moments (user_id, created_at desc);

alter table public.moments enable row level security;

drop policy if exists "see own and friends moments" on public.moments;
create policy "see own and friends moments"
  on public.moments for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where f.user_id = auth.uid() and f.friend_id = moments.user_id
    )
  );

drop policy if exists "insert own moments" on public.moments;
create policy "insert own moments"
  on public.moments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "delete own moments" on public.moments;
create policy "delete own moments"
  on public.moments for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------- REACTIONS ----------
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now()
);

alter table public.reactions enable row level security;

drop policy if exists "see reactions on visible moments" on public.reactions;
create policy "see reactions on visible moments"
  on public.reactions for select
  to authenticated
  using (exists (select 1 from public.moments m where m.id = reactions.moment_id));

drop policy if exists "insert own reactions" on public.reactions;
create policy "insert own reactions"
  on public.reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.moments m where m.id = reactions.moment_id)
  );

-- ---------- REPLIES (pesan balasan ke pemilik momen) ----------
create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.replies enable row level security;

-- Balasan hanya terlihat oleh pengirim & pemilik momen
drop policy if exists "see own or received replies" on public.replies;
create policy "see own or received replies"
  on public.replies for select
  to authenticated
  using (
    auth.uid() = sender_id
    or exists (
      select 1 from public.moments m
      where m.id = replies.moment_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "insert own replies" on public.replies;
create policy "insert own replies"
  on public.replies for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (select 1 from public.moments m where m.id = replies.moment_id)
  );

-- ---------- REALTIME ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.moments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.reactions;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------- ADMIN DASHBOARD RPC (ringkasan semua akun terdaftar) ----------
create or replace function public.admin_list_users()
returns table (
  id uuid,
  username text,
  display_name text,
  email text,
  avatar_url text,
  invite_code text,
  created_at timestamptz,
  moments_count bigint,
  videos_count bigint,
  friends_count bigint,
  last_active_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.display_name,
    coalesce(p.email, u.email) as email,
    p.avatar_url,
    p.invite_code,
    p.created_at,
    count(distinct m.id) as moments_count,
    count(distinct m.id) filter (where m.media_type = 'video') as videos_count,
    count(distinct f.friend_id) as friends_count,
    greatest(p.created_at, max(m.created_at)) as last_active_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.moments m on m.user_id = p.id
  left join public.friendships f on f.user_id = p.id
  group by p.id, u.email
  order by p.created_at desc;
$$;

-- Hapus akun pengguna beserta seluruh file medianya dari Dashboard Admin
create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from storage.objects
  where bucket_id = 'moments'
    and (storage.foldername(name))[1] = target_user_id::text;

  delete from public.profiles where id = target_user_id;
  delete from auth.users where id = target_user_id;
end;
$$;

-- ---------- STORAGE (bucket media foto & video) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'moments',
  'moments',
  true,
  10485760, -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users upload into own folder" on storage.objects;
create policy "users upload into own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'moments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own files" on storage.objects;
create policy "users delete own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'moments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
