const coverImages = import.meta.glob<string>("../assets/company-covers/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
})

export const companyCovers = Object.entries(coverImages)
  .map(([path, url]) => ({ id: path.split("/").pop()!.replace(/\.jpg$/, ""), url }))
  .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }))

/** A record gets one varied default that remains the same across visits and devices. */
export function defaultCompanyCover(accountId: string) {
  let hash = 2166136261
  for (const character of accountId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return companyCovers[(hash >>> 0) % companyCovers.length]
}

export function selectedCompanyCover(accountId: string, metadata: Record<string, unknown>) {
  return companyCovers.find((cover) => cover.id === metadata.companyCoverId) ?? defaultCompanyCover(accountId)
}
