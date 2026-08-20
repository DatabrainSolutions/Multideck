import { createHash } from "node:crypto"
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  createUkslEntryParser,
  UK_SANCTIONS_LIST_CSV_URL,
  UK_SANCTIONS_LIST_SOURCE_CODE,
  type ParsedScreeningEntry,
} from "./screening.ts"

// The UKSL is materially larger than the retired OFSI export.  Small batches
// can exhaust an Edge Function invocation before the snapshot is made current;
// 1,000 rows remains comfortably below the PostgREST payload limit while
// allowing a full refresh to finish in a single protected worker run.
const ENTRY_CHUNK = 1000
// Uploads run through the database API and are independent, so using a wider
// bounded pool keeps the 50 MB UKSL import inside the Edge invocation window.
const ENTRY_INSERT_CONCURRENCY = 12

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

const UKSL_HEADERS = {
  Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
  "User-Agent": "Multideck/1.0 (UK Sanctions List refresh)",
}

function failedResult(downloadedAt: string, message: string): ScreeningIngestResult {
  return {
    sourceCode: UK_SANCTIONS_LIST_SOURCE_CODE,
    status: "failed",
    snapshotId: null,
    entryCount: 0,
    groupCount: 0,
    downloadedAt,
    message,
  }
}

async function fetchUksl(url: string) {
  const response = await fetch(url, { headers: UKSL_HEADERS })
  if (!response.ok) throw new Error(`UK Sanctions List returned ${response.status}.`)
  if (!response.body) throw new Error("The UK Sanctions List could not be read.")
  return response
}

async function sha256OfStream(body: ReadableStream<Uint8Array>) {
  const hasher = createHash("sha256")
  const reader = body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) hasher.update(value)
  }
  return hasher.digest("hex")
}

function toEntryRow(snapshotId: string, entry: ParsedScreeningEntry) {
  return {
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
  }
}

async function insertEntries(admin: AdminClient, snapshotId: string, entries: ParsedScreeningEntry[]) {
  if (!entries.length) return
  const { error } = await admin.from("sys_ScreeningListEntries").insert(
    entries.map((entry) => toEntryRow(snapshotId, entry)),
  )
  if (error) throw new Error(error.message)
}

async function markSourceError(admin: AdminClient, message: string) {
  await admin.from("sys_ScreeningListSources").update({
    ScreeningListSource_LastError: message.slice(0, 500),
  }).eq("ScreeningListSource_Code", UK_SANCTIONS_LIST_SOURCE_CODE)
}

async function abandonIncompleteSnapshots(admin: AdminClient) {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: failed, error: failedError } = await admin
    .from("sys_ScreeningListSnapshots")
    .select("ScreeningListSnapshot_ID")
    .eq("ScreeningListSnapshot_SourceCode", UK_SANCTIONS_LIST_SOURCE_CODE)
    .eq("ScreeningListSnapshot_StatusCode", "failed")
  if (failedError) throw new Error(failedError.message)
  const { data: staleImporting, error: importingError } = await admin
    .from("sys_ScreeningListSnapshots")
    .select("ScreeningListSnapshot_ID")
    .eq("ScreeningListSnapshot_SourceCode", UK_SANCTIONS_LIST_SOURCE_CODE)
    .eq("ScreeningListSnapshot_StatusCode", "importing")
    .lt("ScreeningListSnapshot_DownloadedAt", staleBefore)
  if (importingError) throw new Error(importingError.message)
  const ids = [...(failed ?? []), ...(staleImporting ?? [])].map(
    (row: { ScreeningListSnapshot_ID: string }) => row.ScreeningListSnapshot_ID,
  )
  if (!ids.length) return
  await admin.from("sys_ScreeningListSnapshots").delete().in("ScreeningListSnapshot_ID", ids)
}

async function ingestChangedList(
  admin: AdminClient,
  url: string,
  downloadedAt: string,
) {
  const response = await fetchUksl(url)
  const hasher = createHash("sha256")
  const decoder = new TextDecoder()
  const reader = response.body!.getReader()
  const snapshotId = crypto.randomUUID()
  const groups = new Set<string>()
  let entryCount = 0
  let batch: ParsedScreeningEntry[] = []

  const pendingInserts = new Set<Promise<void>>()
  const queueInsert = (entries: ParsedScreeningEntry[]) => {
    let task: Promise<void>
    task = insertEntries(admin, snapshotId, entries).finally(() => pendingInserts.delete(task))
    pendingInserts.add(task)
  }
  const flush = async () => {
    if (batch.length) queueInsert(batch.splice(0, batch.length))
    await Promise.all(pendingInserts)
  }

  const parser = createUkslEntryParser((entry) => {
    groups.add(entry.groupId)
    batch.push(entry)
    entryCount += 1
  })

  const inserted = await admin.from("sys_ScreeningListSnapshots").insert({
    ScreeningListSnapshot_ID: snapshotId,
    ScreeningListSnapshot_SourceCode: UK_SANCTIONS_LIST_SOURCE_CODE,
    ScreeningListSnapshot_ContentSha256: "0".repeat(64),
    ScreeningListSnapshot_DownloadedAt: downloadedAt,
    ScreeningListSnapshot_CheckedAt: downloadedAt,
    ScreeningListSnapshot_EntryCount: 0,
    ScreeningListSnapshot_GroupCount: 0,
    ScreeningListSnapshot_StatusCode: "importing",
  })
  if (inserted.error) throw new Error(inserted.error.message)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      hasher.update(value)
      parser.push(decoder.decode(value, { stream: true }))
      while (batch.length >= ENTRY_CHUNK) {
        queueInsert(batch.splice(0, ENTRY_CHUNK))
        if (pendingInserts.size >= ENTRY_INSERT_CONCURRENCY) {
          await Promise.race(pendingInserts)
        }
      }
    }
    parser.push(decoder.decode())
    parser.end()
    await flush()
  } catch (error) {
    await admin.from("sys_ScreeningListSnapshots").update({
      ScreeningListSnapshot_StatusCode: "failed",
      ScreeningListSnapshot_FailureMessage: error instanceof Error ? error.message.slice(0, 500) : "Import failed.",
    }).eq("ScreeningListSnapshot_ID", snapshotId)
    throw error
  }

  const contentSha = hasher.digest("hex")
  await admin.from("sys_ScreeningListSnapshots").update({
    ScreeningListSnapshot_ContentSha256: contentSha,
    ScreeningListSnapshot_EntryCount: entryCount,
    ScreeningListSnapshot_GroupCount: groups.size,
  }).eq("ScreeningListSnapshot_ID", snapshotId)

  await admin.from("sys_ScreeningListSnapshots")
    .update({ ScreeningListSnapshot_StatusCode: "superseded" })
    .eq("ScreeningListSnapshot_SourceCode", UK_SANCTIONS_LIST_SOURCE_CODE)
    .eq("ScreeningListSnapshot_StatusCode", "current")
  await admin.from("sys_ScreeningListSnapshots")
    .update({ ScreeningListSnapshot_StatusCode: "current" })
    .eq("ScreeningListSnapshot_ID", snapshotId)
  await admin.from("sys_ScreeningListSources").update({
    ScreeningListSource_LastSuccessAt: downloadedAt,
    ScreeningListSource_LastError: null,
  }).eq("ScreeningListSource_Code", UK_SANCTIONS_LIST_SOURCE_CODE)

  const { data: stale } = await admin
    .from("sys_ScreeningListSnapshots")
    .select("ScreeningListSnapshot_ID")
    .eq("ScreeningListSnapshot_SourceCode", UK_SANCTIONS_LIST_SOURCE_CODE)
    .eq("ScreeningListSnapshot_StatusCode", "superseded")
    .order("ScreeningListSnapshot_DownloadedAt", { ascending: false })
  const dropIds = (stale ?? []).slice(2).map((row: { ScreeningListSnapshot_ID: string }) => row.ScreeningListSnapshot_ID)
  if (dropIds.length) {
    await admin.from("sys_ScreeningListEntries").delete().in("ScreeningListEntry_SnapshotID", dropIds)
    await admin.from("sys_ScreeningListSnapshots").delete().in("ScreeningListSnapshot_ID", dropIds)
  }

  return {
    sourceCode: UK_SANCTIONS_LIST_SOURCE_CODE,
    status: "updated" as const,
    snapshotId,
    entryCount,
    groupCount: groups.size,
    downloadedAt,
    message: `Loaded ${entryCount} consolidated UK Sanctions List names.`,
  }
}

export async function refreshUksl(admin: AdminClient): Promise<ScreeningIngestResult> {
  const downloadedAt = new Date().toISOString()
  const { data: source, error: sourceError } = await admin
    .from("sys_ScreeningListSources")
    .select("ScreeningListSource_Code,ScreeningListSource_DownloadUrl")
    .eq("ScreeningListSource_Code", UK_SANCTIONS_LIST_SOURCE_CODE)
    .maybeSingle()
  if (sourceError) throw new Error(sourceError.message)
  if (!source) throw new Error("The UK Sanctions List source is not configured for this workspace.")

  const url = source.ScreeningListSource_DownloadUrl || UK_SANCTIONS_LIST_CSV_URL
  await admin.from("sys_ScreeningListSources").update({
    ScreeningListSource_LastAttemptAt: downloadedAt,
  }).eq("ScreeningListSource_Code", UK_SANCTIONS_LIST_SOURCE_CODE)
  await abandonIncompleteSnapshots(admin)

  const { data: current } = await admin
    .from("sys_ScreeningListSnapshots")
    .select("ScreeningListSnapshot_ID,ScreeningListSnapshot_ContentSha256,ScreeningListSnapshot_EntryCount,ScreeningListSnapshot_GroupCount,ScreeningListSnapshot_DownloadedAt")
    .eq("ScreeningListSnapshot_SourceCode", UK_SANCTIONS_LIST_SOURCE_CODE)
    .eq("ScreeningListSnapshot_StatusCode", "current")
    .maybeSingle()

  if (current?.ScreeningListSnapshot_ContentSha256) {
    try {
      const contentSha = await sha256OfStream((await fetchUksl(url)).body!)
      if (contentSha === current.ScreeningListSnapshot_ContentSha256) {
        await admin.from("sys_ScreeningListSnapshots").update({
          ScreeningListSnapshot_CheckedAt: downloadedAt,
        }).eq("ScreeningListSnapshot_ID", current.ScreeningListSnapshot_ID)
        await admin.from("sys_ScreeningListSources").update({
          ScreeningListSource_LastSuccessAt: downloadedAt,
          ScreeningListSource_LastError: null,
        }).eq("ScreeningListSource_Code", UK_SANCTIONS_LIST_SOURCE_CODE)
        return {
          sourceCode: UK_SANCTIONS_LIST_SOURCE_CODE,
          status: "unchanged",
          snapshotId: current.ScreeningListSnapshot_ID,
          entryCount: current.ScreeningListSnapshot_EntryCount ?? 0,
          groupCount: current.ScreeningListSnapshot_GroupCount ?? 0,
          downloadedAt: current.ScreeningListSnapshot_DownloadedAt,
          message: "The UK Sanctions List is already current.",
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The UK Sanctions List could not be downloaded."
      await markSourceError(admin, message)
      return failedResult(downloadedAt, message)
    }
  }

  try {
    return await ingestChangedList(admin, url, downloadedAt)
  } catch (error) {
    const message = error instanceof Error ? error.message : "The UK Sanctions List could not be downloaded."
    await markSourceError(admin, message)
    return failedResult(downloadedAt, message)
  }
}
