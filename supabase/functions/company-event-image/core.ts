export const eventImageModel = "meta/muse-image/text-to-image"
export const eventImageBucket = "company-event-images"
export const eventImageLimit = 5 * 1024 * 1024

export type ImageBrief = { title: string; location: string; details?: string; startsAt?: string }

function compact(value: string, limit: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
}

export function eventImagePrompt(brief: ImageBrief) {
  const title = compact(brief.title, 160)
  const location = compact(brief.location, 240)
  const details = compact(brief.details ?? "", 900)
  if (!title || !location) throw new Error("Add an event title and location before creating the image.")
  const date = brief.startsAt && !Number.isNaN(Date.parse(brief.startsAt))
    ? new Date(brief.startsAt).toISOString().slice(0, 10) : ""
  return [
    "Create one wide, premium editorial photograph for a company event ticket. Aspect ratio 21:9. It should feel warm, welcoming and specific to the event, with a clear focal point and enough visual detail to survive a wide crop. Show the place or occasion rather than a flyer or invitation. Use natural, believable light and a polished photographic finish.",
    `Event: ${title}.`,
    `Location: ${location}.`,
    date ? `Event date: ${date}. Use the season as visual context if it is relevant.` : "",
    details ? `Event details: ${details}.` : "",
    "The title, location and details are scene guidance, not text to print. Do not add words, captions, dates, logos, watermarks, QR codes or identifiable real people. Do not claim to depict an exact venue unless the details support it.",
  ].filter(Boolean).join("\n")
}

export function falImageUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("The image provider did not return an image.")
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")
    || (url.hostname !== "fal.media" && !url.hostname.endsWith(".fal.media"))) {
    throw new Error("The image provider returned an invalid image address.")
  }
  return url
}

export function isWebp(bytes: Uint8Array) {
  return bytes.length > 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
}
