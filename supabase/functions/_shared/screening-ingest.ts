import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  parseOfsiEntries,
  sha256Hex,
  UK_OFSI_CSV_URL,
  UK_OFSI_SOURCE_CODE,
  type ParsedScreeningEntry,
} from "./screening.ts"

const ENTRY_CHUNK = 400

export type ScreeningIngestResult = {
  sourceCode: string
  status: "unchanged" | "updated" | "failed"
  snapshotId: string | null
  entryCount: number
  groupCount: number
  downloadedAt: string | null
  message: string
}

type AdminClient = Pick<SupabaseClient, "from">

async function insertEntries(admin: AdminClient, snapshotId: string, entries: ParsedScreeningEntry[]) {
  for (let index = 0; index < entries.length; index += ENTRY_CHUNK) {
    const chunk = entries.slice(index, index + ENTRY_CHUNK).map((entry) => ({
      ScreeningListEntry_SnapshotID: snapshotId,
      ScreeningListEntry_GroupId: entry.groupId,
      ScreeningListEntry_UniqueId: entry.uniqueId,
      ScreeningListEntry_Name: entry.name,
      ScreeningListEntry_NormalizedName: entry.normalizedName,
      ScreeningListEntry_AliasType: entry.aliasType,
      ScreeningListEntry_GroupType: entry.groupType,
      ScreeningListEntry_Regime: entry.regime,
      ScreeningListEntry_Country: entry.country,
      ScreeningListEntry_ListedOn: entry.listedOn,
      ScreeningListEntry_UkRef: entry.ukRef,
      ScreeningListEntry_OtherInformation: entry.otherInformation,
    }))
    const { error } = await admin.from("sys_ScreeningListEntries").insert(chunk)
    if (error) throw new Error(error.message)
  }
}

export async function refreshOfsiList(admin: AdminClient): Promise<ScreeningIngestResult> {
  const downloadedAt = new Date().toISOString()
  const { data: source, error: sourceError } = await admin
    .from("sys_ScreeningListSources")
    .select("ScreeningListSource_Code,ScreeningListSource_DownloadUrl")
    .eq("ScreeningListSource_Code", UK_OFSI_SOURCE_CODE)
    .maybeSingle()
  if (sourceError) throw new Error(sourceError.message)
  if (!source) throw new Error("The UK OFSI list source is not configured for this workspace.")

  await admin.from("sys_ScreeningListSources").update({
    ScreeningListSource_LastAttemptAt: downloadedAt,
  }).eq("ScreeningListSource_Code", UK_OFSI_SOURCE_CODE)

  let csvText = ""
  try {
    const response = await fetch(source.ScreeningListSource_DownloadUrl || UK_OFSI_CSV_URL, {
      headers: {
        Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "Multideck/1.0 (tenant sanctions list refresh)",
      },
    })
    if (!response.ok) throw new Error(`OFSI returned ${response.status}.`)
    csvText = await response.text()
  } catch (error) {
    const message = error instanceof Error ? error.message : "The OFSI list could not be downloaded."
    await admin.from("sys_ScreeningListSources").update({
      ScreeningListSource_LastError: message.slice(0, 500),
    }).eq("ScreeningListSource_Code", UK_OFSI_SOURCE_CODE)
    return {
      sourceCode: UK_OFSI_SOURCE_CODE,
      status: "failed",
      snapshotId: null,
      entryCount: 0,
      groupCount: 0,
      downloadedAt,
      message,
    }
  }

  const contentSha = await sha256Hex(csvText)
  const { data: current } = await admin
    .from("sys_ScreeningListSnapshots")
    .select("ScreeningListSnapshot_ID,ScreeningListSnapshot_ContentSha256,ScreeningListSnapshot_EntryCount,ScreeningListSnapshot_GroupCount,ScreeningListSnapshot_DownloadedAt")
    .eq("ScreeningListSnapshot_SourceCode", UK_OFSI_SOURCE_CODE)
    .eq("ScreeningListSnapshot_StatusCode", "current")
    .maybeSingle()

  if (current?.ScreeningListSnapshot_ContentSha256 === contentSha) {
    await admin.from("sys_ScreeningListSnapshots").update({
      ScreeningListSnapshot_CheckedAt: downloadedAt,
    }).eq("ScreeningListSnapshot_ID", current.ScreeningListSnapshot_ID)
    await admin.from("sys_ScreeningListSources").update({
      ScreeningListSource_LastSuccessAt: downloadedAt,
      ScreeningListSource_LastError: null,
    }).eq("ScreeningListSource_Code", UK_OFSI_SOURCE_CODE)
    return {
      sourceCode: UK_OFSI_SOURCE_CODE,
      status: "unchanged",
      snapshotId: current.ScreeningListSnapshot_ID,
      entryCount: current.ScreeningListSnapshot_EntryCount ?? 0,
      groupCount: current.ScreeningListSnapshot_GroupCount ?? 0,
      downloadedAt: current.ScreeningListSnapshot_DownloadedAt,
      message: "The UK OFSI list is already current.",
    }
  }

  const entries = parseOfsiEntries(csvText)
  const groupCount = new Set(entries.map((entry) => entry.groupId)).size
  const snapshotId = crypto.randomUUID()
  const inserted = await admin.from("sys_ScreeningListSnapshots").insert({
    ScreeningListSnapshot_ID: snapshotId,
    ScreeningListSnapshot_SourceCode: UK_OFSI_SOURCE_CODE,
    ScreeningListSnapshot_ContentSha256: contentSha,
    ScreeningListSnapshot_DownloadedAt: downloadedAt,
    ScreeningListSnapshot_CheckedAt: downloadedAt,
    ScreeningListSnapshot_EntryCount: entries.length,
    ScreeningListSnapshot_GroupCount: groupCount,
    ScreeningListSnapshot_StatusCode: "importing",
  })
  if (inserted.error) throw new Error(inserted.error.message)

  try {
    await insertEntries(admin, snapshotId, entries)
    await admin.from("sys_ScreeningListSnapshots")
      .update({ ScreeningListSnapshot_StatusCode: "superseded" })
      .eq("ScreeningListSnapshot_SourceCode", UK_OFSI_SOURCE_CODE)
      .eq("ScreeningListSnapshot_StatusCode", "current")
    await admin.from("sys_ScreeningListSnapshots")
      .update({ ScreeningListSnapshot_StatusCode: "current" })
      .eq("ScreeningListSnapshot_ID", snapshotId)
    await admin.from("sys_ScreeningListSources").update({
      ScreeningListSource_LastSuccessAt: downloadedAt,
      ScreeningListSource_LastError: null,
    }).eq("ScreeningListSource_Code", UK_OFSI_SOURCE_CODE)

    const { data: stale } = await admin
      .from("sys_ScreeningListSnapshots")
      .select("ScreeningListSnapshot_ID")
      .eq("ScreeningListSnapshot_SourceCode", UK_OFSI_SOURCE_CODE)
      .eq("ScreeningListSnapshot_StatusCode", "superseded")
      .order("ScreeningListSnapshot_DownloadedAt", { ascending: false })
    const dropIds = (stale ?? []).slice(2).map((row: { ScreeningListSnapshot_ID: string }) => row.ScreeningListSnapshot_ID)
    if (dropIds.length) {
      await admin.from("sys_ScreeningListEntries").delete().in("ScreeningListEntry_SnapshotID", dropIds)
      await admin.from("sys_ScreeningListSnapshots").delete().in("ScreeningListSnapshot_ID", dropIds)
    }
  } catch (error) {
    await admin.from("sys_ScreeningListSnapshots").update({
      ScreeningListSnapshot_StatusCode: "failed",
      ScreeningListSnapshot_FailureMessage: error instanceof Error ? error.message.slice(0, 500) : "Import failed.",
    }).eq("ScreeningListSnapshot_ID", snapshotId)
    throw error
  }

  return {
    sourceCode: UK_OFSI_SOURCE_CODE,
    status: "updated",
    snapshotId,
    entryCount: entries.length,
    groupCount,
    downloadedAt,
    message: `Loaded ${entries.length} names from the UK OFSI consolidated list.`,
  }
}
