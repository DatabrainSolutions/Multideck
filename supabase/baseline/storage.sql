INSERT INTO storage.buckets VALUES ('warehouse-documents', 'warehouse-documents', NULL, '2026-07-22 10:20:21.155813+00', '2026-07-22 10:20:21.155813+00', false, false, 10485760, '{application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document}', NULL, 'STANDARD', 'DISABLED');
INSERT INTO storage.buckets VALUES ('profile-photos', 'profile-photos', NULL, '2026-07-29 18:21:30.691398+00', '2026-07-29 18:21:30.691398+00', false, false, 5242880, '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD', 'DISABLED');
INSERT INTO storage.buckets VALUES ('multideck-warehouse', 'multideck-warehouse', NULL, '2026-08-02 13:41:45.010148+00', '2026-08-02 13:41:45.010148+00', false, false, 26214400, NULL, NULL, 'STANDARD', 'DISABLED');
INSERT INTO storage.buckets VALUES ('multideck-documents', 'multideck-documents', NULL, '2026-08-02 17:17:18.802138+00', '2026-08-02 17:17:18.802138+00', false, false, 26214400, NULL, NULL, 'STANDARD', 'DISABLED');
INSERT INTO storage.buckets VALUES ('multideck-generated', 'multideck-generated', NULL, '2026-08-04 12:58:40.131141+00', '2026-08-04 12:58:40.131141+00', false, false, 52428800, '{application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document}', NULL, 'STANDARD', 'DISABLED');
INSERT INTO storage.buckets VALUES ('crm-drive', 'crm-drive', NULL, '2026-08-07 13:07:59.105805+00', '2026-08-07 13:07:59.105805+00', false, false, 52428800, '{image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml,image/heic,image/tiff,application/pdf,application/postscript,image/vnd.adobe.photoshop,video/mp4,video/quicktime,video/webm,text/plain,text/csv,application/json,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,font/woff2,font/ttf,font/otf}', NULL, 'STANDARD', 'DISABLED');
INSERT INTO storage.buckets VALUES ('rate-source-files', 'rate-source-files', NULL, '2026-08-10 16:24:31.267438+00', '2026-08-10 16:24:31.267438+00', false, false, 15728640, '{text/csv,text/tab-separated-values,text/plain,message/rfc822,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet}', NULL, 'STANDARD', 'DISABLED');
INSERT INTO storage.buckets VALUES ('multideck-template-sources', 'multideck-template-sources', NULL, '2026-08-05 15:27:43.312153+00', '2026-08-05 15:27:43.312153+00', false, false, 15728640, '{application/msword,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp}', NULL, 'STANDARD', 'DISABLED');
INSERT INTO storage.buckets VALUES ('icustoms-webhook-captures', 'icustoms-webhook-captures', NULL, '2026-08-21 13:21:05.021242+00', '2026-08-21 13:21:05.021242+00', false, false, 52428800, '{application/json,application/octet-stream,application/pdf,application/x-www-form-urlencoded,multipart/form-data,text/plain}', NULL, 'STANDARD', 'DISABLED');
INSERT INTO storage.buckets VALUES ('tenant-brand-assets', 'tenant-brand-assets', NULL, '2026-09-01 14:14:12.536021+00', '2026-09-01 14:14:12.536021+00', true, false, 2097152, '{image/svg+xml,image/png,image/jpeg}', NULL, 'STANDARD', 'DISABLED');
INSERT INTO storage.buckets VALUES ('email-signatures', 'email-signatures', NULL, '2026-09-11 14:52:08.992335+00', '2026-09-11 14:52:08.992335+00', false, false, 2097152, '{image/png,image/jpeg,image/webp,image/gif}', NULL, 'STANDARD', 'DISABLED');
--
-- Name: objects Company users can add drive objects; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Company users can add drive objects" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'crm-drive'::text) AND public._crm_drive_has_permission('CRM.Drive.Write'::text) AND public._crm_drive_storage_path_allowed(public.app_current_company_id(), name)));


--
-- Name: objects Company users can read drive objects; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Company users can read drive objects" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'crm-drive'::text) AND public._crm_drive_has_permission('CRM.Drive.Read'::text) AND public._crm_drive_storage_path_allowed(public.app_current_company_id(), name)));


--
-- Name: objects Company users can read profile photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Company users can read profile photos" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'profile-photos'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR ( SELECT private.can_read_profile_photo(objects.name) AS can_read_profile_photo))));


--
-- Name: objects Company users can remove drive objects; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Company users can remove drive objects" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'crm-drive'::text) AND public._crm_drive_has_permission('CRM.Drive.Write'::text) AND public._crm_drive_storage_path_allowed(public.app_current_company_id(), name)));


--
-- Name: objects Company users can replace drive objects; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Company users can replace drive objects" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'crm-drive'::text) AND public._crm_drive_has_permission('CRM.Drive.Write'::text) AND public._crm_drive_storage_path_allowed(public.app_current_company_id(), name))) WITH CHECK (((bucket_id = 'crm-drive'::text) AND public._crm_drive_has_permission('CRM.Drive.Write'::text) AND public._crm_drive_storage_path_allowed(public.app_current_company_id(), name)));


--
-- Name: objects Users can remove their own profile photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can remove their own profile photos" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));


--
-- Name: objects Users can replace their own profile photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can replace their own profile photos" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))) WITH CHECK (((bucket_id = 'profile-photos'::text) AND (EXISTS ( SELECT 1
   FROM public."cmp_Users" workspace_user
  WHERE (workspace_user."Auth_User_ID" = ( SELECT auth.uid() AS uid)))) AND (name ~ (('^'::text || (( SELECT auth.uid() AS uid))::text) || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'::text))));


--
-- Name: objects Users can upload their own profile photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can upload their own profile photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'profile-photos'::text) AND (EXISTS ( SELECT 1
   FROM public."cmp_Users" workspace_user
  WHERE (workspace_user."Auth_User_ID" = ( SELECT auth.uid() AS uid)))) AND (name ~ (('^'::text || (( SELECT auth.uid() AS uid))::text) || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'::text))));
