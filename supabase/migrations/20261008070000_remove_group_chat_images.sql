-- Group chat is text only. Stop new uploads and image views; existing
-- messages keep their image_path so old photo messages can show a
-- "no longer available" note.
--
-- To free the storage, empty the group-chat-images bucket from the
-- Supabase dashboard (Storage). Don't delete rows from storage.objects
-- with SQL; that leaves the files behind.

drop policy if exists "group members can upload own chat images" on storage.objects;
drop policy if exists "group members can view chat images" on storage.objects;
