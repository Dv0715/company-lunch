alter table public.restaurants
add column if not exists menu_keywords text[] not null default '{}'::text[];
