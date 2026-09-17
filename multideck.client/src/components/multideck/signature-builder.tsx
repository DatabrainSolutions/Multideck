import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  GripVertical,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "@/components/icons/hugeicons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/i18n/language-provider";
import { SignatureBlockGlyph } from "./signature-block-glyph";
import {
  signatureColumnWidths,
  resizeSignatureColumn,
  resizeSignatureImage,
  newSignatureBlock,
  renderSignatureBlock,
  type SignatureBlock,
  type SignatureBlockKind,
  type SignatureDocument,
  signatureFields,
  signatureKinds,
  type SignatureValues,
} from "@/lib/email-signatures";
import "@/styles/email-signatures.css";

type Slot = { rowId: string; column: number; index: number };
type Drag = {
  block: SignatureBlock;
  fresh: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  angle: number;
  started: boolean;
  slot: Slot | null;
};
export function moveSignatureBlock(
  document: SignatureDocument,
  block: SignatureBlock,
  slot: Slot,
  fresh = false,
): SignatureDocument {
  if (
    !document.rows.find((row) => row.id === slot.rowId)?.columns[slot.column]
  ) return document;
  const next = structuredClone(document);
  let index = slot.index;
  for (const row of next.rows) {
    for (let c = 0; c < row.columns.length; c++) {
      const found = row.columns[c].findIndex((b) => b.id === block.id);
      if (found >= 0 && !fresh) {
        row.columns[c].splice(found, 1);
        if (
          row.id === slot.rowId && c === slot.column && found < index
        ) index--;
      }
    }
  }
  const target = next.rows.find((r) => r.id === slot.rowId)
    ?.columns[slot.column];
  if (target) {
    target.splice(Math.max(0, Math.min(index, target.length)), 0, block);
  }
  return next;
}
type PaletteKind = SignatureBlockKind | "banner" | "disclaimer" | "company";
const paletteLabels = { ...signatureKinds, banner: "Image banner", disclaimer: "Disclaimer", company: "Company details" };
function paletteBlock(kind: PaletteKind): SignatureBlock {
  if (kind === "company") return {...newSignatureBlock("contact"), field: "companyDetails"};
  if (kind === "banner") return { ...newSignatureBlock("image"), width: 440, alt: "" };
  if (kind === "disclaimer") return { ...newSignatureBlock("text"), text: "Add your company disclaimer here.", size: 10, colour: "#647672", padding: 12 };
  return newSignatureBlock(kind);
}
const fieldClass = "sig-field";
export function SignatureBuilder({
  document: savedDoc,
  onChange,
  values,
  assets,
  onUpload,
  readOnly = false,
  brandLogo,
}: {
  document: SignatureDocument;
  onChange: (doc: SignatureDocument) => void;
  values: SignatureValues;
  assets: Record<string, string>;
  onUpload: (file: File) => Promise<{ id: string; url: string }>;
  readOnly?: boolean;
  brandLogo?: { url: string; load: () => Promise<File> };
}) {
  const [resize, setResize] = useState<{preview: SignatureDocument; label: string} | null>(null);
  const doc = resize?.preview || savedDoc;
  const resizeSession = useRef<{base:SignatureDocument;next:SignatureDocument;pointerId:number;startX:number;startWidth:number;rowId:string;blockId?:string;rowWidth:number} | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { t } = useLanguage();
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width:760px)").matches
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width:760px)");
    const change = () => setCompact(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const reduced = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<SignatureDocument[]>([]);
  const [future, setFuture] = useState<SignatureDocument[]>([]);
  const current = useRef({ doc, onChange });
  current.current = { doc: savedDoc, onChange };
  const skipClick = useRef(false);
  const selected = doc.rows.flatMap((r) => r.columns.flat()).find((b) =>
    b.id === selectedId
  );
  function commit(next: SignatureDocument) {
    if (readOnly || !mounted.current) return;
    setHistory((h) => [...h.slice(-39), current.current.doc]);
    setFuture([]);
    current.current.onChange(next);
  }
  const commitRef = useRef(commit);
  commitRef.current = commit;
  function beginResize(event: ReactPointerEvent<HTMLElement>, rowId: string, blockId?: string) {
    if (readOnly || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const row = current.current.doc.rows.find(row=>row.id===rowId)!;
    const element = event.currentTarget.closest(".sig-canvas-row")!;
    const block = row.columns.flat().find(block=>block.id===blockId);
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSession.current = {base:current.current.doc,next:current.current.doc,pointerId:event.pointerId,startX:event.clientX,startWidth:block ? event.currentTarget.closest(".sig-canvas-block")!.getBoundingClientRect().width : signatureColumnWidths(row)[0],rowId,blockId,rowWidth:element.getBoundingClientRect().width};
    setResize({preview:current.current.doc,label:block ? `${block.width} px` : `${signatureColumnWidths(row)[0]}% / ${signatureColumnWidths(row)[1]}%`});
  }
  useEffect(() => {
    function move(event:PointerEvent) {
      const session=resizeSession.current;
      if (!session || event.pointerId!==session.pointerId) return;
      const delta=event.clientX-session.startX;
      if (session.blockId) {
        session.next=resizeSignatureImage(session.base,session.blockId,session.startWidth+delta);
        const block=session.next.rows.flatMap(row=>row.columns.flat()).find(block=>block.id===session.blockId)!;
        setResize({preview:session.next,label:`${block.width} px`});
      } else {
        let percent=session.startWidth+delta/session.rowWidth*100;
        const snap=[25,33,50,67,75].find(value=>Math.abs(value-percent)<1.2);
        if(snap!==undefined) percent=snap;
        session.next=resizeSignatureColumn(session.base,session.rowId,percent);
        const widths=signatureColumnWidths(session.next.rows.find(row=>row.id===session.rowId)!);
        setResize({preview:session.next,label:`${widths[0]}% / ${widths[1]}%`});
      }
    }
    function finish(event?:PointerEvent, cancel=false) {
      const session=resizeSession.current;
      if(!session || event && event.pointerId!==session.pointerId) return;
      resizeSession.current=null;setResize(null);
      // A remote edit wins over an in-progress gesture; never replace newer content.
      if(!cancel && current.current.doc===session.base && session.next!==session.base) {
        commitRef.current(session.next);setAnnouncement(t("Size updated"));
      }
    }
    function cancel(event:PointerEvent){finish(event,true)}
    function key(event:KeyboardEvent){if(event.key==="Escape" && resizeSession.current){event.preventDefault();finish(undefined,true)}}
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",finish);window.addEventListener("pointercancel",cancel);window.addEventListener("keydown",key);
    return ()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",finish);window.removeEventListener("pointercancel",cancel);window.removeEventListener("keydown",key)};
  }, [t]);
  function editBlock(patch: Partial<SignatureBlock>) {
    if (!selected) return;
    if (selected.kind === "image" && patch.width !== undefined) { commit(resizeSignatureImage(current.current.doc,selected.id,patch.width)); return; }
    commit({
      ...current.current.doc,
      rows: current.current.doc.rows.map((r) => ({
        ...r,
        columns: r.columns.map((c) =>
          c.map((b) => b.id === selected.id ? { ...b, ...patch } : b)
        ),
      })),
    });
  }
  function slotAt(x: number, y: number): Slot | null {
    const hit = globalThis.document.elementFromPoint(x, y);
    const canvas = hit?.closest<HTMLElement>(".sig-canvas");
    if (!canvas) return null;
    const cells = [
      ...canvas.querySelectorAll<HTMLElement>("[data-signature-column]"),
    ];
    const cell = hit?.closest<HTMLElement>("[data-signature-column]") ||
      cells.reduce<HTMLElement | null>((best, item) => {
        const r = item.getBoundingClientRect();
        const distance = Math.hypot(
          Math.max(r.left - x, 0, x - r.right),
          Math.max(r.top - y, 0, y - r.bottom),
        );
        if (!best) return item;
        const b = best.getBoundingClientRect();
        return distance <
            Math.hypot(
              Math.max(b.left - x, 0, x - b.right),
              Math.max(b.top - y, 0, y - b.bottom),
            )
          ? item
          : best;
      }, null);
    if (!cell) return null;
    const blocks = [...cell.querySelectorAll<HTMLElement>(".sig-canvas-block")];
    const index = blocks.findIndex((b) => {
      const r = b.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return {
      rowId: cell.dataset.rowId!,
      column: Number(cell.dataset.column),
      index: index < 0 ? blocks.length : index,
    };
  }
  function startDrag(
    e: ReactPointerEvent<HTMLElement>,
    block: SignatureBlock,
    fresh: boolean,
  ) {
    if (readOnly || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = {
      block,
      fresh,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      offsetX: Math.min(80, e.clientX - rect.left),
      offsetY: Math.min(24, e.clientY - rect.top),
      angle: 0,
      started: false,
      slot: null,
    };
    dragRef.current = next;
    setDrag(next);
  }
  useEffect(() => {
    if (!drag) return;
    function move(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const next = {
        ...d,
        x: e.clientX,
        y: e.clientY,
        angle: reduced
          ? 0
          : Math.max(-5, Math.min(5, d.angle * .55 + (e.clientX - d.x) * .18)),
        started: d.started ||
          Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5,
        slot: slotAt(e.clientX, e.clientY),
      };
      dragRef.current = next;
      setDrag(next);
      const scroller = globalThis.document.elementFromPoint(
        e.clientX,
        e.clientY,
      )?.closest<HTMLElement>(".sig-canvas-scroll");
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (e.clientY > r.bottom - 40) scroller.scrollTop += 10;
        else if (e.clientY < r.top + 40) scroller.scrollTop -= 10;
      }
    }
    function finish(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (d.started) {
        skipClick.current = true;
        window.setTimeout(() => {
          skipClick.current = false;
        }, 180);
        const slot = slotAt(e.clientX, e.clientY);
        if (slot) {
          commitRef.current(
            moveSignatureBlock(current.current.doc, d.block, slot, d.fresh),
          );
          setSelectedId(d.block.id);
          setLanded(d.block.id);
          window.setTimeout(() => setLanded(null), 120);
          setAnnouncement(
            `${signatureKinds[d.block.kind]} ${t("placed in signature")}`,
          );
        }
      }
      dragRef.current = null;
      setDrag(null);
    }
    function cancel() {
      dragRef.current = null;
      setDrag(null);
      setAnnouncement(t("Move cancelled"));
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [!!drag, reduced, t]);
  function add(kind: PaletteKind) {
    if (skipClick.current) return;
    const block = paletteBlock(kind);
    const row = doc.rows.at(-1);
    if (row) {
      commit(
        moveSignatureBlock(doc, block, {
          rowId: row.id,
          column: row.columns.length - 1,
          index: row.columns.at(-1)!.length,
        }, true),
      );
    } else {commit({
        ...doc,
        rows: [{ id: crypto.randomUUID(), columns: [[block]] }],
      });}
    setSelectedId(block.id);
  }
  function moveSelected(
    direction: "up" | "down" | "left" | "right",
    id = selectedId,
  ) {
    const row = doc.rows.find((r) =>
      r.columns.some((c) => c.some((b) => b.id === id))
    );
    if (!row) return;
    const column = row.columns.findIndex((c) => c.some((b) => b.id === id));
    const index = row.columns[column].findIndex((b) => b.id === id);
    const block = row.columns[column][index];
    if (direction === "left" || direction === "right") {
      const target = column + (direction === "left" ? -1 : 1);
      if (!row.columns[target]) return;
      commit(
        moveSignatureBlock(doc, block, {
          rowId: row.id,
          column: target,
          index: row.columns[target].length,
        }),
      );
    } else {
      const target = direction === "up" ? index - 1 : index + 2;
      if (target < 0 || target > row.columns[column].length) return;
      commit(
        moveSignatureBlock(doc, block, {
          rowId: row.id,
          column,
          index: target,
        }),
      );
    }
    setAnnouncement(`${signatureKinds[block.kind]} ${t("moved")} ${direction}`);
  }
  function deleteBlock(id = selectedId) {
    if (!id) return;
    setError("");
    commit({
      ...doc,
      rows: doc.rows.map((r) => ({
        ...r,
        columns: r.columns.map((c) => c.filter((b) => b.id !== id)),
      })),
    });
    setSelectedId(null);
  }
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const asset = await onUpload(file);
      // Resolve against the latest document so slow uploads cannot overwrite edits or another block.
      const targetId = selected?.id;
      const next = current.current.doc;
      commit({
        ...next,
        rows: next.rows.map((row) => ({
          ...row,
          columns: row.columns.map((column) =>
            column.map((block) =>
              block.id === targetId
                ? {
                  ...block,
                  assetId: asset.id,
                  alt: file.name.replace(/\.[^.]+$/, ""),
                }
                : block
            )
          ),
        })),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function uploadBadges(files: File[]) {
    if (!selected || !files.length) return;
    const targetId = selected.id;
    if ((selected.images?.length || 0) + files.length > 8) {
      setError(t("Add up to eight trust badges."));
      return;
    }
    setUploading(true);
    setError("");
    try {
      for (const file of files) {
        const asset = await onUpload(file);
        const next = current.current.doc;
        commit({
          ...next,
          rows: next.rows.map((row) => ({
            ...row,
            columns: row.columns.map((column) =>
              column.map((block) =>
                block.id === targetId
                  ? {
                    ...block,
                    images: [...(block.images || []), {
                      assetId: asset.id,
                      alt: file.name.replace(/\.[^.]+$/, ""),
                      href: "",
                    }],
                  }
                  : block
              )
            ),
          })),
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  const spring = reduced
    ? { duration: 0 }
    : { type: "spring" as const, visualDuration: .22, bounce: .12 };
  const propertyPanel = (
    <aside className="sig-properties" aria-label={t("Block properties")}>
      <AnimatePresence mode="wait" initial={false}>
        {selected
          ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, x: reduced ? 0 : 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : .18, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between">
                <div className="sig-panel-label">
                  {t(signatureKinds[selected.kind])}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={t("Close block properties")}
                  onClick={() => setSelectedId(null)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="sig-remove-field text-[var(--md-red)]"
                disabled={readOnly}
                onClick={() =>
                  deleteBlock()}
              >
                <Trash2 className="size-3.5" />
                {t("Remove field")}
              </Button>
              {selected.kind === "badges"
                ? (
                  <>
                    <p className="sig-hint">
                      {t(
                        "Accreditations, memberships and awards, displayed together in one row.",
                      )}
                    </p>
                    <label className="sig-upload">
                      <Upload className="size-4" />
                      {uploading ? t("Uploading…") : t("Upload badges")}
                      <input
                        className="sr-only"
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={readOnly || uploading}
                        onChange={(e) => {
                          void uploadBadges(Array.from(e.target.files || []));
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {(selected.images || []).map((image, index) => (
                      <div
                        className="sig-badge-editor"
                        key={`${image.assetId}-${index}`}
                      >
                        <img src={assets[image.assetId]} alt={image.alt} />
                        <label className="sig-field">
                          {t("Badge description")}
                          <Input
                            disabled={readOnly}
                            value={image.alt}
                            onChange={(e) =>
                              editBlock({
                                images: selected.images!.map((item, i) =>
                                  i === index
                                    ? { ...item, alt: e.target.value }
                                    : item
                                ),
                              })}
                          />
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={readOnly}
                          aria-label={`${t("Remove badge")} ${index + 1}`}
                          onClick={() =>
                            editBlock({
                              images: selected.images!.filter((_, i) =>
                                i !== index
                              ),
                            })}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    <label className="sig-field">
                      {t("Badge width")}
                      <input
                        type="range"
                        disabled={readOnly}
                        min="24"
                        max="120"
                        value={selected.width}
                        onChange={(e) =>
                          editBlock({ width: Number(e.target.value) })}
                      />
                      <span>{selected.width} px</span>
                    </label>
                  </>
                )
                : null}
              {selected.kind === "image"
                ? (
                  <>
                    <label className="sig-upload">
                      <Upload className="size-4" />
                      {uploading ? t("Uploading…") : t(
                        selected.assetId ? "Replace image" : "Upload image",
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={readOnly || uploading}
                        className="sr-only"
                        onChange={(e) => void upload(e.target.files?.[0])}
                      />
                    </label>
                    {assets[selected.assetId || ""]
                      ? (
                        <img
                          className="sig-upload-preview"
                          src={assets[selected.assetId!]}
                          alt={selected.alt}
                        />
                      )
                      : (
                        <p className="sig-hint">
                          {t(
                            "Upload your logo, photo or banner. PNG, JPG, GIF or WebP, up to 2 MB.",
                          )}
                        </p>
                      )}
                    {brandLogo
                      ? (
                        <Button
                          variant="outline"
                          disabled={readOnly || uploading}
                          onClick={async () => {
                            setError("");
                            setUploading(true);
                            try {
                              const file = await brandLogo.load();
                              if (mounted.current) await upload(file);
                            } catch (e) {
                              setError((e as Error).message);
                            } finally { setUploading(false); }
                          }}
                        >
                          <Upload className="size-3.5" />
                          {t("Import from brand")}
                        </Button>
                      )
                      : null}
                    <label className={fieldClass}>
                      {t("Image description")}
                      <Input
                        value={selected.alt}
                        disabled={readOnly}
                        onChange={(e) =>
                          editBlock({ alt: e.target.value })}
                      />
                    </label>
                    <label className={fieldClass}>
                      {t("Width")}
                      <input
                        type="range"
                        min="24"
                        max={doc.width}
                        value={selected.width}
                        disabled={readOnly}
                        onChange={(e) =>
                          editBlock({ width: Number(e.target.value) })}
                      />
                      <span>{selected.width} px</span>
                    </label>
                  </>
                )
                : null}
              {!["image", "badges", "divider", "spacer", "import"].includes(
                  selected.kind,
                )
                ? (
                  <>
                    <label className={fieldClass}>
                      {t("Content")}
                      <Select
                        value={selected.field || "__empty"}
                        disabled={readOnly}
                        onValueChange={(value) =>
                          editBlock({
                            field: (value === "__empty" ? "" : value) as SignatureBlock["field"],
                          })}
>
<SelectTrigger aria-label={t("Content")} className="w-full min-w-0 text-[12px]"><SelectValue /></SelectTrigger>
<SelectContent>
                        <SelectItem value="__empty">{t("Custom text")}</SelectItem>
                        {Object.entries(signatureFields).map((
                          [key, label],
                        ) => <SelectItem key={key} value={key}>{t(label)}</SelectItem>)}
                      </SelectContent></Select>
                    </label>
                    {selected.field
                      ? (
                        <div className="sig-variable-chip">
                          {t(signatureFields[selected.field])}
                        </div>
                      )
                      : (
                        <label className={fieldClass}>
                          {t("Text")}
                          <textarea
                            rows={3}
                            value={selected.text}
                            disabled={readOnly}
                            onChange={(e) =>
                              editBlock({ text: e.target.value })}
                          />
                        </label>
                      )}
                    <label className={fieldClass}>
                      {t("Label (optional)")}
                      <Input
                        value={selected.label}
                        disabled={readOnly}
                        onChange={(e) => editBlock({ label: e.target.value })}
                      />
                    </label>
                  </>
                )
                : null}
              {selected.kind === "import"
                ? (
                  <p className="sig-hint">
                    {t(
                      "Imported formatting is preserved as one block. Re-import to replace its content, or add editable blocks around it.",
                    )}
                  </p>
                )
                : null}
              {!["spacer", "divider", "import"].includes(selected.kind)
                ? (
                  <label className={fieldClass}>
                    {t("Link (optional)")}
                    <Input
                      type="url"
                      placeholder="https://"
                      value={selected.href}
                      disabled={readOnly}
                      onChange={(e) => editBlock({ href: e.target.value })}
                    />
                  </label>
                )
                : null}
              {!["spacer", "image", "badges"].includes(selected.kind)
                ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className={fieldClass}>
                      {t("Colour")}
                      <input
                        type="color"
                        value={selected.colour}
                        disabled={readOnly}
                        onChange={(e) => editBlock({ colour: e.target.value })}
                      />
                    </label>
                    <label className={fieldClass}>
                      {t("Text size")}
                      <Input
                        type="number"
                        min={10}
                        max={28}
                        value={selected.size}
                        disabled={readOnly}
                        onChange={(e) =>
                          editBlock({ size: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                )
                : null}
              <label className={fieldClass}>
                {t("Spacing")}
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={selected.padding}
                  disabled={readOnly}
                  onChange={(e) =>
                    editBlock({ padding: Number(e.target.value) })}
                />
              </label>
              <label className={fieldClass}>
                {t("Alignment")}
                <Select
                  value={selected.align}
                  disabled={readOnly}
                  onValueChange={(value) =>
                    editBlock({
                      align: (value === "__empty" ? "" : value) as SignatureBlock["align"],
                    })}
>
<SelectTrigger aria-label={t("Alignment")} className="w-full min-w-0 text-[12px]"><SelectValue /></SelectTrigger>
<SelectContent>
                  <SelectItem value="left">{t("Left")}</SelectItem>
                  <SelectItem value="center">{t("Centre")}</SelectItem>
                  <SelectItem value="right">{t("Right")}</SelectItem>
                </SelectContent></Select>
              </label>
              <label className="mt-3 flex items-center gap-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={selected.bold}
                  disabled={readOnly}
                  onChange={(e) => editBlock({ bold: e.target.checked })}
                />
                {t("Emphasise text")}
              </label>
              <div className="mt-5 flex flex-wrap gap-1">
                {([
                  ["up", ArrowUp],
                  ["down", ArrowDown],
                  ["left", ArrowLeft],
                  ["right", ArrowRight],
                ] as const).map(([dir, Icon]) => (
                  <Button
                    key={dir}
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    disabled={readOnly}
                    aria-label={`${t("Move block")} ${dir}`}
                    onClick={() => moveSelected(dir)}
                  >
                    <Icon className="size-3.5" />
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={readOnly}
                  aria-label={t("Duplicate block")}
                  onClick={() => {
                    const block = { ...selected, id: crypto.randomUUID() };
                    const row = doc.rows.find((r) =>
                      r.columns.some((c) => c.some((b) => b.id === selected.id))
                    )!;
                    const column = row.columns.findIndex((c) =>
                      c.some((b) => b.id === selected.id)
                    );
                    commit(
                      moveSignatureBlock(doc, block, {
                        rowId: row.id,
                        column,
                        index: row.columns[column].findIndex((b) =>
                          b.id === selected.id
                        ) + 1,
                      }, true),
                    );
                    setSelectedId(block.id);
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </motion.div>
          )
          : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: .18 }}
            >
              <div className="sig-panel-label">{t("Signature settings")}</div>
              <label className={fieldClass}>
                {t("Column spacing")}
                <input type="range" min={0} max={48} value={doc.columnGap ?? 20} disabled={readOnly} onChange={event => commit({...doc, columnGap: Number(event.target.value)})} />
                <span>{doc.columnGap ?? 20} px</span>
              </label>
              <label className={fieldClass}>
                {t("Width")}
                <input
                  type="range"
                  min={240}
                  max={640}
                  value={doc.width}
                  disabled={readOnly}
                  onChange={(e) =>
                    commit({ ...doc, width: Number(e.target.value) })}
                />
                <span>{doc.width} px</span>
              </label>
              <label className={fieldClass}>
                {t("Background")}
                <input
                  type="color"
                  value={doc.colour}
                  disabled={readOnly}
                  onChange={(e) => commit({ ...doc, colour: e.target.value })}
                />
              </label>
              <p className="sig-hint mt-8">
                {t(
                  "Choose a block in the signature to edit its content and appearance.",
                )}
              </p>
            </motion.div>
          )}
      </AnimatePresence>
      {error
        ? (
          <p role="alert" className="mt-3 text-[12px] text-[var(--md-red)]">
            {error}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setError("")}
            >
              {t("Dismiss")}
            </button>
          </p>
        )
        : null}
    </aside>
  );
  return (
    <div
      className="sig-builder"
      onFocusCapture={(event) => {
        if (!compact || !selectedId) {
          returnFocus.current = event
            .target as HTMLElement;
        }
      }}
    >
      <aside className="sig-palette" aria-label={t("Signature blocks")}>
        <div className="sig-panel-label">{t("Add a block")}</div>
        <div className="sig-palette-grid">
          {(Object.keys(paletteLabels) as PaletteKind[]).filter((k) =>
            k !== "import"
          ).map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={readOnly}
              className="sig-palette-item"
              onPointerDown={(e) => startDrag(e, paletteBlock(kind), true)}
              onClick={() => add(kind)}
              aria-label={`${t("Add")} ${t(paletteLabels[kind])}`}
            >
              <SignatureBlockGlyph kind={kind} />
              <span>{t(paletteLabels[kind])}</span>
            </button>
          ))}
        </div>
        <p className="sig-hint">
          {t("Drag into your signature, or click to add.")}
        </p>
        <div className="sig-panel-label mt-6">{t("Rows")}</div>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              disabled={readOnly}
              className="sig-row-add"
              onClick={() =>
                commit({
                  ...doc,
                  rows: [...doc.rows, {
                    id: crypto.randomUUID(),
                    columns: Array.from({ length: n }, () => []),
                  }],
                })}
            >
              <span className="flex gap-1">
                {Array.from(
                  { length: n },
                  (_, i) => (
                    <span
                      key={i}
                      className="h-5 flex-1 rounded-sm bg-[var(--md-accent-a12)] shadow-[var(--md-shadow-line)]"
                    />
                  ),
                )}
              </span>
              <span>{t(["One column", "Two columns", "Three columns", "Four columns"][n - 1])}</span>
            </button>
          ))}
        </div>
        <div className="sig-hint mt-6">
          {t(
            "Select a block to edit it. Alt + arrow keys move it; Escape cancels a drag.",
          )}
        </div>
      </aside>
      <section className="sig-canvas-column">
        <div className="sig-canvas-toolbar">
          <span>{t("Signature")}</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!history.length || readOnly}
              aria-label={t("Undo")}
              onClick={() => {
                const last = history.at(-1)!;
                setFuture((f) => [doc, ...f]);
                setHistory((h) => h.slice(0, -1));
                onChange(last);
              }}
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!future.length || readOnly}
              aria-label={t("Redo")}
              onClick={() => {
                const next = future[0];
                setHistory((h) => [...h, doc]);
                setFuture((f) => f.slice(1));
                onChange(next);
              }}
            >
              <RotateCcw className="size-4 -scale-x-100" />
            </Button>
          </div>
        </div>
        <div className="sig-canvas-scroll">
          <div className="sig-email-context">
            <span className="sig-context-line w-24" />
            <span className="sig-context-line w-4/5" />
            <span className="sig-context-line w-3/5" />
            <p>{t("Kind regards,")}</p>
          </div>
          <div
            className="sig-canvas"
            style={{ maxWidth: doc.width, background: doc.colour }}
            aria-label={t("Editable signature")}
          >
            {doc.rows.map((row, rowIndex) => (
              <motion.div
                layout={!resize}
                transition={spring}
                key={row.id}
                className={`sig-canvas-row group/row ${resize ? "is-resizing" : ""}`}
                style={{gap: doc.columnGap ?? 20}}
              >
                <div className="sig-row-tools">
                  <span>{t("Row")} {rowIndex + 1}</span>
                  {(["up", "down"] as const).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      disabled={readOnly ||
                        direction === "up" && rowIndex === 0 ||
                        direction === "down" &&
                          rowIndex === doc.rows.length - 1}
                      aria-label={`${t("Move row")} ${
                        rowIndex + 1
                      } ${direction}`}
                      onClick={() => {
                        const rows = [...doc.rows];
                        const target = rowIndex + (direction === "up" ? -1 : 1);
                        [rows[rowIndex], rows[target]] = [
                          rows[target],
                          rows[rowIndex],
                        ];
                        commit({ ...doc, rows });
                      }}
                    >
                      {direction === "up"
                        ? <ArrowUp className="size-3" />
                        : <ArrowDown className="size-3" />}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={readOnly}
                    aria-label={`${t("Delete row")} ${rowIndex + 1}`}
                    onClick={() => {
                      setError("");
                      commit({
                        ...doc,
                        rows: doc.rows.filter((r) => r.id !== row.id),
                      });
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </div>
                {row.columns.length === 2 && !readOnly ? <button type="button" role="slider" aria-label={`${t("Column width row")} ${rowIndex+1}`} aria-valuemin={20} aria-valuemax={80} aria-valuenow={signatureColumnWidths(row)[0]} aria-valuetext={`${signatureColumnWidths(row)[0]}% / ${signatureColumnWidths(row)[1]}%`} className="sig-column-resizer" style={{left:`calc((100% - ${doc.columnGap ?? 20}px) * ${signatureColumnWidths(row)[0]/100} + ${(doc.columnGap ?? 20)/2}px)`}} onPointerDown={event=>beginResize(event,row.id)} onKeyDown={event=>{
                  if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
                  event.preventDefault(); const value=event.key==="Home"?20:event.key==="End"?80:signatureColumnWidths(row)[0]+(event.key==="ArrowRight"?1:-1)*(event.shiftKey?5:1);
                  commit(resizeSignatureColumn(doc,row.id,value));
                }}><span className="sig-resize-grip" /><span className="sig-resize-label">{resizeSession.current?.rowId===row.id ? resize?.label : `${signatureColumnWidths(row)[0]}% / ${signatureColumnWidths(row)[1]}%`}</span></button> : null}
                {row.columns.map((column, colIndex) => (
                  <div
                    key={colIndex}
                    className="sig-canvas-cell"
                    data-signature-column
                    data-row-id={row.id}
                    data-column={colIndex}
                    style={{ flex: `${signatureColumnWidths(row)[colIndex]} 1 0%` }}
                  >
                    {Array.from({ length: column.length + 1 }, (_, index) => {
                      const b = column[index];
                      const isTarget = drag?.started &&
                        drag.slot?.rowId === row.id &&
                        drag.slot.column === colIndex &&
                        drag.slot.index === index;
                      const rendered = b
                        ? renderSignatureBlock(b, values, assets)
                        : null;
                      return (
                        <div
                          key={b?.id || "end"}
                          data-signature-slot
                          data-row-id={row.id}
                          data-column={colIndex}
                          data-index={index}
                          className={`sig-slot ${
                            column.length === 0 ? "is-empty" : ""
                          }`}
                        >
                          <AnimatePresence>
                            {isTarget
                              ? (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 42, opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{
                                    duration: reduced ? 0 : .18,
                                    ease: "easeOut",
                                  }}
                                  className="sig-drop-position"
                                >
                                  <span>{t("Place here")}</span>
                                </motion.div>
                              )
                              : null}
                          </AnimatePresence>
                          {b
                            ? (
                              <motion.div
                                layout={!resize}
                                animate={{
                                  scale: !reduced && landed === b.id
                                    ? 1.018
                                    : 1,
                                }}
                                transition={spring}
                                className={`sig-canvas-block ${
                                  selectedId === b.id ? "is-selected" : ""
                                } ${
                                  drag?.started && drag.block.id === b.id
                                    ? "is-dragging"
                                    : ""
                                }`}
                                style={b.kind === "image" ? {width:b.width,maxWidth:"100%"} : undefined}
                                tabIndex={0}
                                role="button"
                                aria-label={`${t("Edit")} ${
                                  t(signatureKinds[b.kind])
                                }`}
                                onClick={() => {
                                  if (!skipClick.current) setSelectedId(b.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.target !== e.currentTarget) return;
                                  if (
                                    e.key === "Delete" || e.key === "Backspace"
                                  ) {
                                    e.preventDefault();
                                    deleteBlock(b.id);
                                  }
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setSelectedId(b.id);
                                  }
                                  if (
                                    e.altKey &&
                                    [
                                      "ArrowUp",
                                      "ArrowDown",
                                      "ArrowLeft",
                                      "ArrowRight",
                                    ].includes(e.key)
                                  ) {
                                    e.preventDefault();
                                    moveSelected(
                                      e.key.slice(5).toLowerCase() as "up",
                                      b.id,
                                    );
                                  }
                                }}
                              >
                                {b.kind === "image" && !readOnly ? <button type="button" role="slider" className="sig-image-resizer" aria-label={t("Resize image")} aria-valuemin={24} aria-valuemax={Math.floor((doc.width-(doc.columnGap ?? 20)*(row.columns.length-1))*(row.columns.length===2?.8:1/row.columns.length))} aria-valuenow={b.width} onPointerDown={event=>{setSelectedId(b.id);beginResize(event,row.id,b.id)}} onClick={event=>event.stopPropagation()} onKeyDown={event=>{
                                  if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key))return;
                                  event.preventDefault();event.stopPropagation();commit(resizeSignatureImage(doc,b.id,b.width+(["ArrowRight","ArrowUp"].includes(event.key)?1:-1)*(event.shiftKey?10:2)));
                                }}><span className="sig-resize-label">{b.width} px</span></button> : null}
                                <button
                                  type="button"
                                  className="sig-block-remove"
                                  disabled={readOnly}
                                  aria-label={`${t("Remove field")} ${
                                    t(signatureKinds[b.kind])
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteBlock(b.id);
                                  }}
                                >
                                  <X className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  className="sig-drag-handle"
                                  disabled={readOnly}
                                  aria-label={`${t("Drag")} ${
                                    t(signatureKinds[b.kind])
                                  }`}
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    startDrag(e, b, false);
                                  }}
                                >
                                  <GripVertical className="size-3.5" />
                                </button>
                                {(b.kind === "image" &&
                                      !assets[b.assetId || ""] ||
                                    b.kind === "badges" && !b.images?.length)
                                  ? (
                                    <div className="sig-image-placeholder">
                                      <SignatureBlockGlyph kind={b.kind} />
                                      <span>
                                        {t(
                                          b.kind === "badges"
                                            ? "Upload your trust badges"
                                            : "Upload your logo or image",
                                        )}
                                      </span>
                                    </div>
                                  )
                                  : b.field && !values[b.field]
                                  ? (
                                    <div className="sig-field-placeholder">
                                      {t(signatureFields[b.field])}
                                      <span>{t("Hidden when empty")}</span>
                                    </div>
                                  )
                                  : (
                                    <div
                                      className="sig-block-output"
                                      dangerouslySetInnerHTML={{
                                        __html: rendered?.html || "",
                                      }}
                                    />
                                  )}
                              </motion.div>
                            )
                            : !column.length
                            ? (
                              <div className="sig-empty-column">
                                <Plus className="size-4" />
                                <span>{t("Drop a block here")}</span>
                              </div>
                            )
                            : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </motion.div>
            ))}
            {!doc.rows.length
              ? (
                <button
                  type="button"
                  className="sig-empty-column w-full"
                  onClick={() =>
                    commit({
                      ...doc,
                      rows: [{ id: crypto.randomUUID(), columns: [[]] }],
                    })}
                >
                  <Plus className="size-4" />
                  {t("Add a row to begin")}
                </button>
              )
              : null}
          </div>
          <p className="sig-canvas-caption">
            {t("Personal details fill automatically for each sender.")}
          </p>
        </div>
      </section>
      {compact && selected
        ? (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) setSelectedId(null);
            }}
          >
            <DialogContent
              showCloseButton={false}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (returnFocus.current?.isConnected) {
                  returnFocus.current.focus();
                }
              }}
              className="!inset-x-0 !bottom-0 !top-auto !left-0 !translate-x-0 !translate-y-0 !max-w-none max-h-[72dvh] overflow-y-auto rounded-b-none p-0 motion-reduce:animate-none"
            >
              <DialogTitle className="sr-only">
                {t("Block properties")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("Edit this block, then close to return to your signature.")}
              </DialogDescription>
              {propertyPanel}
            </DialogContent>
          </Dialog>
        )
        : propertyPanel}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {drag?.started
        ? createPortal(
          <div
            className="sig-drag-overlay"
            style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY }}
          >
            <motion.div
              animate={{ rotate: drag.angle, scale: 1.025 }}
              transition={{ type: "spring", stiffness: 650, damping: 38 }}
              className="sig-drag-preview"
            >
              <SignatureBlockGlyph kind={drag.block.kind} active />
              <span>{t(signatureKinds[drag.block.kind])}</span>
            </motion.div>
          </div>,
          globalThis.document.body,
        )
        : null}
    </div>
  );
}
