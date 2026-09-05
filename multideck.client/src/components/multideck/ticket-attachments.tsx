import { useId, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { FileText, Paperclip, X } from "@/components/icons/hugeicons"
import { TicketPdfPreview } from "./ticket-pdf-preview"
import { Button } from "@/components/ui/button"
import { ImageLightbox } from "@/components/multideck/image-lightbox"
import { ticketFileAccept, ticketFileHint, type TicketAttachment } from "@/lib/ticket-attachments"

// Multideck-owned. Identical geometry and motion are used in App and Cloud.
export function TicketAttachmentList({ items, onRemove, disabled = false }: {
  items: TicketAttachment[]; onRemove?: (id: string) => void; disabled?: boolean
}) {
  const [pdf, setPdf] = useState<TicketAttachment | null>(null)
  const reduced = useReducedMotion()
  const images = items.filter(file => file.mediaType.startsWith("image/")).map(file => ({id:file.id,src:file.signedUrl,alt:file.originalName}))
  return <><ImageLightbox items={images}>{lightbox => <ul aria-label={onRemove ? "Files to send" : "Attachments"} className="relative flex min-w-0 flex-wrap gap-2">
    <AnimatePresence initial={false} mode="popLayout">
      {items.map(file => {
        const image = file.mediaType.startsWith("image/")
        const extension = file.originalName.split(".").at(-1)?.toUpperCase() || "FILE"
        const preview = image
          ? <img src={file.signedUrl} alt="" width={80} height={80} className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
          : <span className="flex aspect-square size-20 shrink-0 flex-col items-center justify-center gap-1.5 rounded-[calc(var(--md-radius-xl)-4px)] bg-[var(--md-surface-tint)] text-[var(--md-text)]"><FileText className="size-6" strokeWidth={1.5} aria-hidden="true" /><span className="text-[10px] font-medium tracking-wide">{extension}</span></span>
        const contents = <>{preview}{!image ? <span className="min-w-0 flex-1 py-2 pl-3 pr-9 text-left"><span data-i18n-skip className="block truncate text-[13px] font-medium text-[var(--md-ink)]" title={file.originalName}>{file.originalName}</span><span className="mt-1 block text-xs tabular-nums text-[var(--md-text)]">{file.byteSize < 1048576 ? Math.max(1, Math.round(file.byteSize / 1024)) + " KB" : (file.byteSize / 1048576).toFixed(1) + " MB"}</span></span> : null}</>
        const tile = image ? "size-20 overflow-hidden rounded-[var(--md-radius-xl)]" : "flex min-h-22 w-64 max-w-full items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)]"
        return <motion.li key={file.id} layout={reduced ? false : "position"} initial={reduced ? {opacity:0} : {opacity:0,scale:0.96,y:4}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:reduced?1:0.96,transition:{duration:reduced?0:0.14,ease:"easeIn"}}} transition={{duration:reduced?0:0.22,ease:[0.22,1,0.36,1]}} className="group relative max-w-full">
          {image ? <motion.button type="button" ref={node=>lightbox.registerTrigger(file.id,node)} layoutId={lightbox.layoutIdFor(file.id)} onClick={()=>lightbox.open(file.id)} aria-label={"Preview "+file.originalName} title={file.originalName} className={tile+" block outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] focus-visible:ring-offset-2 motion-safe:active:scale-[0.96]"}>{contents}</motion.button>
            : file.mediaType === "application/pdf" ? <button type="button" onClick={() => setPdf(file)} aria-label={"Preview "+file.originalName} title={file.originalName} className={tile+" outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] focus-visible:ring-offset-2 motion-safe:active:scale-[0.96]"}>{contents}</button>
            : <a href={file.signedUrl} target="_blank" rel="noreferrer" download={file.originalName} aria-label={"Download "+file.originalName} title={file.originalName} className={tile+" outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] focus-visible:ring-offset-2 motion-safe:active:scale-[0.96]"}>{contents}</a>}
          {onRemove ? <button type="button" disabled={disabled} onClick={()=>onRemove(file.id)} aria-label={"Remove "+file.originalName} title={"Remove "+file.originalName} className="absolute right-0 top-0 z-10 flex size-10 items-start justify-end p-1 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--md-accent)] disabled:cursor-wait [@media(hover:none)]:opacity-100 motion-reduce:transition-none"><span className="grid size-6 place-items-center rounded-full bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-soft)] transition-transform duration-150 motion-safe:active:scale-[0.96]"><X className="size-3" strokeWidth={1.5} aria-hidden="true" /></span></button> : null}
        </motion.li>
      })}
    </AnimatePresence>
  </ul>}</ImageLightbox>{pdf ? <TicketPdfPreview key={pdf.id} file={pdf} onClose={() => setPdf(null)} /> : null}</>
}

export function TicketAttachmentPicker({onAdd,disabled=false}: {onAdd:(files:File[])=>void;disabled?:boolean}) {
  const input=useRef<HTMLInputElement>(null)
  const id=useId()
  return <><input ref={input} id={id} type="file" accept={ticketFileAccept} multiple disabled={disabled} className="sr-only" tabIndex={-1} aria-label="Choose attachments" onChange={event=>{onAdd(Array.from(event.target.files??[]));event.target.value=""}} />
    <Button type="button" variant="ghost" disabled={disabled} onClick={()=>input.current?.click()} aria-label="Attach files" title={ticketFileHint} className="size-11 rounded-[var(--md-radius-2xl)] p-0 motion-safe:active:scale-[0.96]"><Paperclip className="size-5" strokeWidth={1.5} aria-hidden="true" /></Button>
  </>
}
