-- Adds an admin flag to teachers so a designated admin can create new
-- teacher accounts (real Supabase Auth logins) for colleagues, via a
-- server-side-only admin API route. Run this once in the SQL Editor after
-- 0001-0007.

alter table teachers add column if not exists is_admin boolean not null default false;

-- Bootstrap the first admin.
update teachers set is_admin = true where email = 'agguadalupe@pampangastateu.edu.ph';
