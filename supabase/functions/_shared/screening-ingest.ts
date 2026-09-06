import { createHash } from "node:crypto"
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  createUkslEntryParser,
  UK_OFSI_CSV_URL,
  UK_OFSI_SOURCE_CODE,
  UK_SANCTIONS_LIST_SOURCE_CODE,
  type ParsedScreeningEntry,
} from "./screening.ts"

// Preserve the deployed UKSL import throughput with bounded in-flight batches.
const ENTRY_CHUNK = 1000
const ENTRY_INSERT_CONCURRENCY = 12

export type ScreeningIngestResult = {
  sourceCode: string
  status: "unchanged" | "updated" | "failed" | "pending"
  snapshotId: string | null
  entryCount: number
  groupCount: number
  downloadedAt: string | null
  message: string
}

type AdminClient = Pick<SupabaseClient, "from" | "rpc">

const OFSI_HEADERS = {
  Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
  "User-Agent": "Multideck/1.0 (tenant sanctions list refresh)",
}

function failedResult(sourceCode: string, downloadedAt: string, message: string): ScreeningIngestResult {
  return {
    sourceCode,
    status: "failed",
    snapshotId: null,
    entryCount: 0,
    groupCount: 0,
    downloadedAt,
    message,
  }
}

async function fetchOfsi(url: string, timeoutMs = 60_000) {
  const response = await fetch(url, { headers: OFSI_HEADERS, signal: AbortSignal.timeout(timeoutMs), redirect: "error" })
  if (!response.ok) throw new Error(`OFSI returned ${response.status}.`)
  if (!response.body) throw new Error("The OFSI list could not be read.")
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

async function abandonIncompleteSnapshots(admin: AdminClient, sourceCode: string) {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: failed, error: failedError } = await admin
    .from("sys_ScreeningListSnapshots")
    .select("ScreeningListSnapshot_ID")
    .eq("ScreeningListSnapshot_SourceCode", sourceCode)
    .eq("ScreeningListSnapshot_StatusCode", "failed")
  if (failedError) throw new Error(failedError.message)
  const { data: staleImporting, error: importingError } = await admin
    .from("sys_ScreeningListSnapshots")
    .select("ScreeningListSnapshot_ID")
    .eq("ScreeningListSnapshot_SourceCode", sourceCode)
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
  token: string,
  sourceCode: string,
) {
  // The CSV is streamed while batches persist. Keep its deadline within the lease.
  const response = await fetchOfsi(url, 180_000)
  const hasher = createHash("sha256")
  const decoder = new TextDecoder()
  const reader = response.body!.getReader()
  const snapshotId = crypto.randomUUID()
  const groups = new Set<string>()
  let entryCount = 0
  let batch: ParsedScreeningEntry[] = []

  const pendingInserts = new Set<Promise<void>>()
  let insertFailure: unknown
  const queueInsert = (entries: ParsedScreeningEntry[]) => {
    let task: Promise<void>
    task = insertEntries(admin, snapshotId, entries)
      .catch(error => { insertFailure ??= error })
      .finally(() => pendingInserts.delete(task))
    pendingInserts.add(task)
  }
  const flush = async () => {
    if (pendingInserts.size >= ENTRY_INSERT_CONCURRENCY) await Promise.race(pendingInserts)
    if (insertFailure) throw insertFailure
    if (batch.length) queueInsert(batch.splice(0, batch.length))
    await Promise.all(pendingInserts)
    if (insertFailure) throw insertFailure
  }

  const parser = createUkslEntryParser((entry) => {
    groups.add(entry.groupId)
    batch.push(entry)
    entryCount += 1
  })

  const inserted = await admin.from("sys_ScreeningListSnapshots").insert({
    ScreeningListSnapshot_ID: snapshotId,
    ScreeningListSnapshot_SourceCode: sourceCode,
    ScreeningListSnapshot_ContentSha256: "0".repeat(64),
    ScreeningListSnapshot_DownloadedAt: downloadedAt,
    ScreeningListSnapshot_CheckedAt: downloadedAt,
    ScreeningListSnapshot_EntryCount: 0,
    ScreeningListSnapshot_GroupCount: 0,
    ScreeningListSnapshot_StatusCode: "importing",
    ScreeningListSnapshot_FeedUrl: url,
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
        if (insertFailure) throw insertFailure
        if (pendingInserts.size >= ENTRY_INSERT_CONCURRENCY) await Promise.race(pendingInserts)
        if (insertFailure) throw insertFailure
        queueInsert(batch.splice(0, ENTRY_CHUNK))
      }
    }
    parser.push(decoder.decode())
    parser.end()
    await flush()
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    await Promise.all(pendingInserts)
    await admin.from("sys_ScreeningListSnapshots").update({
      ScreeningListSnapshot_StatusCode: "failed",
      ScreeningListSnapshot_FailureMessage: error instanceof Error ? error.message.slice(0, 500) : "Import failed.",
    }).eq("ScreeningListSnapshot_ID", snapshotId)
    throw error
  }

  const contentSha = hasher.digest("hex")
  const { error: publishError } = await admin.rpc("cmp_finish_screening_refresh", {
    p_token: token, p_snapshot_id: snapshotId, p_hash: contentSha,
    p_entry_count: entryCount, p_group_count: groups.size,
  })
  if (publishError) throw new Error(publishError.message)

  const { data: stale } = await admin
    .from("sys_ScreeningListSnapshots")
    .select("ScreeningListSnapshot_ID")
    .eq("ScreeningListSnapshot_SourceCode", sourceCode)
    .eq("ScreeningListSnapshot_StatusCode", "superseded")
    .order("ScreeningListSnapshot_DownloadedAt", { ascending: false })
  const dropIds = (stale ?? []).slice(2).map((row: { ScreeningListSnapshot_ID: string }) => row.ScreeningListSnapshot_ID)
  if (dropIds.length) {
    await admin.from("sys_ScreeningListEntries").delete().in("ScreeningListEntry_SnapshotID", dropIds)
    await admin.from("sys_ScreeningListSnapshots").delete().in("ScreeningListSnapshot_ID", dropIds)
  }

  return {
    sourceCode,
    status: "updated" as const,
    snapshotId,
    entryCount,
    groupCount: groups.size,
    downloadedAt,
    message: `Loaded ${entryCount} names from the UK Sanctions List.`,
  }
}

export async function refreshOfsiList(admin: AdminClient): Promise<ScreeningIngestResult> {
  const downloadedAt = new Date().toISOString()
  const token = crypto.randomUUID()
  const { data: claim, error: claimError } = await admin.rpc("cmp_claim_screening_refresh", { p_token: token })
  if (claimError) throw new Error(claimError.message)
  const { data: list, error: listError } = await admin.rpc("cmp_screening_list_status")
  if (listError) throw new Error(listError.message)
  const sourceCode = list?.sourceCode
  if (sourceCode !== UK_SANCTIONS_LIST_SOURCE_CODE && sourceCode !== UK_OFSI_SOURCE_CODE) {
    throw new Error("The active UK Sanctions List source is unavailable.")
  }
  if (claim !== "acquired") {
    return {
      sourceCode,
      status: claim === "current" && list?.loaded && !list?.stale ? "unchanged" : claim === "busy" ? "pending" : "failed",
      snapshotId: list?.snapshotId ?? null,
      entryCount: list?.entryCount ?? 0,
      groupCount: list?.groupCount ?? 0,
      downloadedAt: list?.downloadedAt ?? null,
      message: claim === "busy"
        ? "The UK Sanctions List is being checked. Try screening again shortly."
        : claim === "current"
          ? "The workspace list has been verified within its refresh interval."
          : "The UK Sanctions List could not be verified. Please retry in a minute.",
    }
  }

  try {
    const { data: source, error: sourceError } = await admin.from("sys_ScreeningListSources")
      .select("ScreeningListSource_DownloadUrl")
      .eq("ScreeningListSource_Code", sourceCode).maybeSingle()
    if (sourceError) throw new Error(sourceError.message)
    // Fail closed on obsolete or unreviewed feeds; never revalidate the retired file.
    if (source?.ScreeningListSource_DownloadUrl !== UK_OFSI_CSV_URL) {
      throw new Error("The current UK Sanctions List source must be configured before screening.")
    }
    await abandonIncompleteSnapshots(admin, sourceCode)
    const { data: current, error: currentError } = await admin.from("sys_ScreeningListSnapshots")
      .select("ScreeningListSnapshot_ID,ScreeningListSnapshot_ContentSha256,ScreeningListSnapshot_EntryCount,ScreeningListSnapshot_GroupCount,ScreeningListSnapshot_DownloadedAt,ScreeningListSnapshot_FeedUrl")
      .eq("ScreeningListSnapshot_SourceCode", sourceCode)
      .eq("ScreeningListSnapshot_StatusCode", "current").maybeSingle()
    if (currentError) throw new Error(currentError.message)
    if (current?.ScreeningListSnapshot_FeedUrl === UK_OFSI_CSV_URL && current?.ScreeningListSnapshot_ContentSha256) {
      const contentSha = await sha256OfStream((await fetchOfsi(UK_OFSI_CSV_URL)).body!)
      if (contentSha === current.ScreeningListSnapshot_ContentSha256) {
        const { error } = await admin.rpc("cmp_finish_screening_refresh", {
          p_token: token, p_snapshot_id: current.ScreeningListSnapshot_ID, p_hash: contentSha,
          p_entry_count: current.ScreeningListSnapshot_EntryCount, p_group_count: current.ScreeningListSnapshot_GroupCount,
        })
        if (error) throw new Error(error.message)
        return {
          sourceCode, status: "unchanged", snapshotId: current.ScreeningListSnapshot_ID,
          entryCount: current.ScreeningListSnapshot_EntryCount, groupCount: current.ScreeningListSnapshot_GroupCount,
          downloadedAt: current.ScreeningListSnapshot_DownloadedAt,
          message: "The UK Sanctions List was checked and has not changed.",
        }
      }
    }
    return await ingestChangedList(admin, UK_OFSI_CSV_URL, downloadedAt, token, sourceCode)
  } catch (error) {
    const message = error instanceof Error ? error.message : "The UK Sanctions List could not be downloaded."
    const { error: failureError } = await admin.rpc("cmp_fail_screening_refresh", { p_token: token, p_message: message })
    if (failureError) throw new Error(failureError.message)
    return failedResult(sourceCode, downloadedAt, message)
  }
}

export async function ensureScreeningList(admin: AdminClient) {
  const refresh = await refreshOfsiList(admin)
  const { data: list, error } = await admin.rpc("cmp_screening_list_status")
  if (error) throw new Error(error.message)
  return { list, refresh, ready: refresh.status !== "failed" && refresh.status !== "pending" && list?.loaded === true && list?.stale === false }
}
