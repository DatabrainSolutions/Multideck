-- Required before installing public-schema.sql into a new tenant project.
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_trgm with schema extensions;
