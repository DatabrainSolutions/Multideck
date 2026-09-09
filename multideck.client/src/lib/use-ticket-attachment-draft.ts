import { useEffect, useRef, useState } from "react"
import { ticketFileMime, validateTicketFiles, type TicketAttachment } from "./ticket-attachments"

export function useTicketAttachmentDraft(contextKey: string) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const cache = useRef(new Map<File, string>())
  const previews = useRef(new Map<File, TicketAttachment>())
  const currentKey = useRef(contextKey)
  const [, refresh] = useState(0)
  useEffect(() => {
    if(currentKey.current===contextKey)return
    currentKey.current=contextKey
    for(const item of previews.current.values()) URL.revokeObjectURL(item.signedUrl)
    previews.current.clear();cache.current.clear();setFiles([]);setError(null);refresh(n=>n+1)
  },[contextKey])
  useEffect(() => {
    const urls=previews.current
    return () => { for(const item of urls.values())URL.revokeObjectURL(item.signedUrl);urls.clear() }
  },[])
  function add(incoming: File[]) {
    try {
      const next=[...files,...incoming.filter(file=>!files.some(current=>current.name===file.name&&current.size===file.size&&current.lastModified===file.lastModified))]
      validateTicketFiles(next)
      for(const file of next)if(!previews.current.has(file))previews.current.set(file,{id:crypto.randomUUID(),originalName:file.name,mediaType:ticketFileMime(file),byteSize:file.size,signedUrl:URL.createObjectURL(file)})
      setFiles(next);setError(null)
    } catch (cause) { setError(cause instanceof Error?cause.message:"These files could not be added. Try again.") }
  }
  function remove(id: string) {
    setFiles(current=>current.filter(file=>previews.current.get(file)?.id!==id))
    // Keep the preview URL alive through its exit animation; all URLs are released on clear/unmount.
    setError(null)
  }
  function clear() {
    setFiles([]);setError(null);cache.current.clear()
    // The component's exit keeps its own preview visible briefly.
  }
  return {files,items:files.map(file=>previews.current.get(file)!).filter(Boolean),error,add,remove,clear,cache:cache.current}
}
