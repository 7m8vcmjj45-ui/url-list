create extension if not exists pgcrypto with schema extensions;

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  list_key_hash bytea not null,
  url text not null check (
    char_length(url) between 1 and 4096
    and url ~* '^https?://[^[:space:]]+$'
  ),
  title text check (title is null or char_length(title) <= 300),
  created_at timestamptz not null default now(),
  constraint links_list_key_hash_url_key unique (list_key_hash, url)
);

create index if not exists links_list_key_hash_created_at_idx
  on public.links (list_key_hash, created_at desc);

alter table public.links enable row level security;

-- The table itself is intentionally inaccessible from the public Data API.
-- Only the three narrowly scoped functions below are callable by anon clients.
revoke all on table public.links from anon, authenticated;

create or replace function public.save_link(
  p_list_key text,
  p_url text,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text := nullif(btrim(p_title), '');
begin
  if char_length(p_list_key) < 20 or char_length(p_list_key) > 256 then
    raise exception 'list key must be between 20 and 256 characters'
      using errcode = '22023';
  end if;

  if char_length(p_url) > 4096 or p_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'URL must begin with http:// or https://'
      using errcode = '22023';
  end if;

  if v_title is not null and char_length(v_title) > 300 then
    v_title := left(v_title, 300);
  end if;

  insert into public.links as saved_link (list_key_hash, url, title)
  values (extensions.digest(p_list_key, 'sha256'), p_url, v_title)
  on conflict (list_key_hash, url) do update
    set title = coalesce(excluded.title, saved_link.title)
  returning saved_link.id into v_id;

  return v_id;
end;
$$;

create or replace function public.get_links(p_list_key text)
returns table (
  id uuid,
  url text,
  title text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select saved_link.id, saved_link.url, saved_link.title, saved_link.created_at
  from public.links as saved_link
  where saved_link.list_key_hash = extensions.digest(p_list_key, 'sha256')
  order by saved_link.created_at desc;
$$;

create or replace function public.delete_link(p_list_key text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted boolean;
begin
  delete from public.links as saved_link
  where saved_link.id = p_id
    and saved_link.list_key_hash = extensions.digest(p_list_key, 'sha256')
  returning true into v_deleted;

  return coalesce(v_deleted, false);
end;
$$;

revoke execute on function public.save_link(text, text, text) from public, authenticated;
revoke execute on function public.get_links(text) from public, authenticated;
revoke execute on function public.delete_link(text, uuid) from public, authenticated;

grant usage on schema public to anon;
grant execute on function public.save_link(text, text, text) to anon;
grant execute on function public.get_links(text) to anon;
grant execute on function public.delete_link(text, uuid) to anon;

comment on table public.links is 'URLs saved from MyList clients. The list key is stored only as a SHA-256 hash.';
comment on function public.save_link(text, text, text) is 'Save or de-duplicate a URL for the supplied list key.';
comment on function public.get_links(text) is 'Return URLs belonging to the supplied list key.';
comment on function public.delete_link(text, uuid) is 'Delete one URL only when its list key matches.';
