-- Run once in Supabase SQL Editor, then delete this local file.
-- These values are never loaded by index.html.
set search_path = public, extensions;

insert into public.site_access_codes (password_hash, role)
values
    (crypt('Neko-nikoni', gen_salt('bf')), 'normal'),
    (crypt('Admin-KN8tuXchxJkWSIlMpB50Qmj6', gen_salt('bf')), 'admin');

select pg_notify('pgrst', 'reload schema');
