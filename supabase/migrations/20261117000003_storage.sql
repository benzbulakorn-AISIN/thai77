-- =====================================================================
-- เที่ยวไทย 77 จังหวัด — Migration 003: Storage buckets & policies
-- Buckets:
--   memory-photos  PRIVATE  path: {user_id}/{visited_or_memory_id}/{uuid}.webp
--   trip-covers    PRIVATE  path: {user_id}/{trip_id}/{uuid}.webp
--   place-images   PUBLIC   path: {place_id}/{uuid}.webp   (admin upload only, licensed images)
-- Client compresses to WebP <= ~1600px / ~500 KB; server hard limit 5 MB.
-- EXIF/GPS is stripped by re-encoding on the client.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('memory-photos', 'memory-photos', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('trip-covers',   'trip-covers',   false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('place-images',  'place-images',  true,  5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Private, per-user folders ----------
create policy "own folder read" on storage.objects for select to authenticated
  using (bucket_id in ('memory-photos','trip-covers')
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('memory-photos','trip-covers')
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own folder update" on storage.objects for update to authenticated
  using (bucket_id in ('memory-photos','trip-covers')
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('memory-photos','trip-covers')
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own folder delete" on storage.objects for delete to authenticated
  using (bucket_id in ('memory-photos','trip-covers')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Trip co-members may view the trip cover: {owner_id}/{trip_id}/file
-- Safe cast helper: non-UUID folder names simply return false (no cast error)
create or replace function public.is_trip_member_text(p_trip text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_trip ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.is_trip_member(p_trip::uuid) else false end;
$$;

create policy "trip cover member read" on storage.objects for select to authenticated
  using (bucket_id = 'trip-covers'
         and public.is_trip_member_text((storage.foldername(name))[2]));

-- ---------- Public place images: anyone reads, admin writes ----------
create policy "place images admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'place-images' and public.is_admin());
create policy "place images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'place-images' and public.is_admin())
  with check (bucket_id = 'place-images' and public.is_admin());
create policy "place images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'place-images' and public.is_admin());
-- (public bucket => reads served via public URL, no select policy needed)
