export type TicketAttachment = { id: string; originalName: string; mediaType: string; byteSize: number; signedUrl: string }
export const ticketFileTypes: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain", csv: "text/csv",
}
export const ticketFileAccept = Object.keys(ticketFileTypes).map(extension => "." + extension).join(",")
export const ticketFileHint = "Images, PDF, Word, Excel, PowerPoint, TXT or CSV. Up to 5 files, 10 MB each."
export const ticketFileMime = (file: File) => ticketFileTypes[file.name.split(".").at(-1)?.toLowerCase() ?? ""] ?? ""
export function validateTicketFiles(files: File[]) {
  if (files.length > 5) throw new Error("Attach up to 5 files per message.")
  if (files.some(file => !ticketFileMime(file))) throw new Error("Choose an image, PDF, Word, Excel, PowerPoint, TXT or CSV file.")
  if (files.some(file => !file.size || file.size > 10 * 1024 * 1024)) throw new Error("Each file must be between 1 byte and 10 MB.")
  if (files.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) throw new Error("Keep the attachments under 25 MB in total.")
  if (files.some(file => file.name.length > 200 || /[\x00-\x1f\\/]/.test(file.name))) throw new Error("Use a shorter file name without slashes or control characters.")
}
export type TicketFileRequest = <T>(body: Record<string, unknown>) => Promise<T>
export async function uploadTicketFiles(request: TicketFileRequest, ticketId: string, files: File[], cache: Map<File,string>, progress: (label:string)=>void, visibility = "public") {
  validateTicketFiles(files)
  const ids: string[] = []
  for (const [index,file] of files.entries()) {
    let id = cache.get(file)
    if (!id) {
      progress(`Uploading file ${index + 1} of ${files.length}…`)
      const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(value => value.toString(16).padStart(2,"0")).join("")
      const prepared = await request<{attachment:{id:string;signedUrl:string}}>({action:"prepare_message_attachment",ticketId,visibility,attachment:{originalName:file.name,mediaType:ticketFileMime(file),byteSize:file.size,sha256}})
      const form = new FormData()
      form.append("cacheControl","900")
      form.append("", new Blob([file], {type:ticketFileMime(file)}), file.name)
      const response = await fetch(prepared.attachment.signedUrl,{method:"PUT",headers:{"x-upsert":"false"},body:form,signal:AbortSignal.timeout(60000)})
      if(!response.ok)throw new Error("This file could not be uploaded. Your draft is still here; try again.")
      progress(`Checking file ${index + 1} of ${files.length}…`)
      const verified = await request<{attachment:{id:string;verified:boolean}}>({action:"complete_message_attachment",ticketId,visibility,attachmentId:prepared.attachment.id})
      if(verified.attachment.verified!==true)throw new Error("This file could not be checked. Remove it and try again.")
      id=verified.attachment.id
      cache.set(file,id)
    }
    ids.push(id)
  }
  return ids
}

