-- Synthetic prerequisite data; only loaded into the owned rehearsal cluster.
insert into public."sys_ScreeningListSources" (
  "ScreeningListSource_Code","ScreeningListSource_Name","ScreeningListSource_Publisher",
  "ScreeningListSource_DownloadUrl","ScreeningListSource_LastSuccessAt","ScreeningListSource_IsActive")
values ('uk_ofsi_consolidated','Historical UK feed','Historical publisher','https://example.test/retired.csv','2026-08-01',false),
  ('uk_sanctions_list','UK Sanctions List','FCDO','https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv','2026-08-02',true);
insert into public."sys_ScreeningListSnapshots" (
  "ScreeningListSnapshot_ID","ScreeningListSnapshot_SourceCode","ScreeningListSnapshot_ContentSha256",
  "ScreeningListSnapshot_DownloadedAt","ScreeningListSnapshot_CheckedAt",
  "ScreeningListSnapshot_EntryCount","ScreeningListSnapshot_GroupCount","ScreeningListSnapshot_StatusCode")
values ('50000000-0000-4000-8000-000000000001','uk_ofsi_consolidated',repeat('a',64),'2026-08-01','2026-08-02',1,1,'current'),
  ('50000000-0000-4000-8000-000000000002','uk_sanctions_list',repeat('b',64),'2026-08-02','2026-08-03',1,1,'current'),
  ('50000000-0000-4000-8000-000000000003','uk_sanctions_list',repeat('c',64),'2026-08-03','2026-08-03',0,0,'importing');
insert into public."sys_ScreeningListEntries" (
  "ScreeningListEntry_SnapshotID","ScreeningListEntry_GroupId","ScreeningListEntry_Name","ScreeningListEntry_NormalizedName")
values ('50000000-0000-4000-8000-000000000001','SYNTHETIC-1','Synthetic old evidence','synthetic old evidence'),
  ('50000000-0000-4000-8000-000000000002','SYNTHETIC-2','Unrelated evidence','unrelated evidence');
create table freight_rehearsal.screening_sources_before as select * from public."sys_ScreeningListSources";
create table freight_rehearsal.screening_snapshots_before as select * from public."sys_ScreeningListSnapshots";
create table freight_rehearsal.screening_entries_before as select * from public."sys_ScreeningListEntries";
