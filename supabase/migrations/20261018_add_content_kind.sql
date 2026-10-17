alter table public.links add column if not exists content_kind text
  check (content_kind is null or content_kind in ('comic', 'video'));

drop function if exists public.get_links(text);

create function public.get_links(p_list_key text)
returns table (
  id uuid,
  url text,
  title text,
  custom_title text,
  performers text[],
  content_kind text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    saved_link.id,
    saved_link.url,
    saved_link.title,
    saved_link.custom_title,
    saved_link.performers,
    saved_link.content_kind,
    saved_link.created_at
  from public.links as saved_link
  where saved_link.list_key_hash = extensions.digest(p_list_key, 'sha256')
  order by saved_link.created_at desc;
$$;

drop function if exists public.edit_link(text, uuid, text, text[]);
drop function if exists public.edit_link(text, uuid, text, text[], text);

create function public.edit_link(
  p_list_key text,
  p_id uuid,
  p_custom_title text,
  p_performers text[] default null,
  p_content_kind text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edited boolean;
  v_title text := nullif(btrim(p_custom_title), '');
  v_performers text[];
  v_content_kind text := nullif(lower(btrim(p_content_kind)), '');
begin
  if char_length(p_list_key) < 20 or char_length(p_list_key) > 256 then
    raise exception 'list key must be between 20 and 256 characters'
      using errcode = '22023';
  end if;

  if v_title is not null and char_length(v_title) > 300 then
    v_title := left(v_title, 300);
  end if;

  if v_content_kind is not null and v_content_kind not in ('comic', 'video') then
    raise exception 'content kind must be comic or video'
      using errcode = '22023';
  end if;

  if p_performers is not null then
    select coalesce(array_agg(cleaned.name order by cleaned.name), '{}'::text[])
    into v_performers
    from (
      select distinct left(btrim(actor_name), 100) as name
      from unnest(p_performers) as actor_name
      where nullif(btrim(actor_name), '') is not null
      limit 50
    ) as cleaned;
  end if;

  update public.links as saved_link
  set
    custom_title = v_title,
    performers = case
      when p_performers is null then saved_link.performers
      else coalesce(v_performers, '{}'::text[])
    end,
    content_kind = coalesce(v_content_kind, saved_link.content_kind)
  where saved_link.id = p_id
    and saved_link.list_key_hash = extensions.digest(p_list_key, 'sha256')
  returning true into v_edited;

  return coalesce(v_edited, false);
end;
$$;

revoke execute on function public.get_links(text) from public, authenticated;
revoke execute on function public.edit_link(text, uuid, text, text[], text) from public, authenticated;
grant execute on function public.get_links(text) to anon;
grant execute on function public.edit_link(text, uuid, text, text[], text) to anon;

comment on function public.get_links(text) is 'Return URLs belonging to the supplied list key.';
comment on function public.edit_link(text, uuid, text, text[], text) is 'Edit a saved title, content kind, and manually confirmed performer names.';

notify pgrst, 'reload schema';
