import {
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Laptop,
  LayoutTemplate,
  Plus,
  Redo,
  Smartphone,
  Undo,
  X,
} from "@/components/icons/hugeicons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/i18n/language-provider";
import { mdEaseOut } from "@/lib/motion";
import { SignatureBlockGlyph } from "./signature-block-glyph";
import { type CommitMode, SignaturePropertiesPanel, type Swatch } from "./signature-properties";
import { SignatureTemplatePicker } from "./signature-template-picker";
import { SegmentedControl } from "./workflow-components";
import {
  renderSignatureBlock,
  resizeSignatureColumn,
  resizeSignatureImage,
  safeSignatureLink,
  signatureColumnWidths,
  signatureContentWidth,
  signatureDefaultAccent,
  signatureFields,
  signatureFonts,
  signatureImageUrl,
  type SignatureBlock,
  type SignatureDocument,
  type SignatureRow,
  type SignatureValues,
} from "@/lib/email-signatures";
import {
  setSignatureRowColumns,
  signatureBlockGlyph,
  signatureBlockLabel,
  signaturePaletteBlock,
  signaturePaletteGroups,
  signaturePaletteLabels,
  type SignaturePaletteKind,
} from "@/lib/signature-blocks";
import {
  fillSignatureBrandLogo,
  mixSignatureColour,
  recolourSignatureAccent,
  signatureNeedsBrandLogo,
} from "@/lib/signature-templates";
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
type Arrival = { id: string; rect: DOMRect } | null;
type Direction = "up" | "down" | "left" | "right";

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

const layoutPresets: { id: string; label: string; widths: number[] }[] = [
  { id: "one", label: "One column", widths: [100] },
  { id: "split", label: "Two columns", widths: [50, 50] },
  { id: "aside", label: "Narrow and wide", widths: [30, 70] },
  { id: "three", label: "Three columns", widths: [33, 33, 33] },
  { id: "four", label: "Four columns", widths: [25, 25, 25, 25] },
];
const hex = /^#[0-9a-f]{6}$/i;
const placeholderRatio = { logo: 2.6, photo: 1, banner: 4.4, image: 1.6 } as const;

/** Moves a freshly added block from the palette tile that created it into its resting place. */
function FlightIn(
  { id, arrival, reduced, children }: { id: string; arrival: MutableRefObject<Arrival>; reduced: boolean; children: ReactNode },
) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const from = arrival.current;
    const element = ref.current;
    if (!from || from.id !== id || !element || reduced) return;
    arrival.current = null;
    element.scrollIntoView({ block: "nearest" });
    const to = element.getBoundingClientRect();
    const x = from.rect.left + from.rect.width / 2 - (to.left + to.width / 2);
    const y = from.rect.top + from.rect.height / 2 - (to.top + to.height / 2);
    const scale = Math.max(.3, Math.min(1, from.rect.width / Math.max(1, to.width)));
    element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    element.style.opacity = "0";
    const controls = animate(
      element,
      { x: [x, 0], y: [y, 0], scale: [scale, 1], opacity: [0, 1] },
      { type: "spring", visualDuration: .52, bounce: .18, opacity: { duration: .22, ease: mdEaseOut } },
    );
    return () => {
      controls.stop();
      element.style.transform = "";
      element.style.opacity = "";
      arrival.current = from;
    };
  }, [id, arrival, reduced]);
  return <div ref={ref} className="sig-flight">{children}</div>;
}

export function SignatureBuilder({
  document: savedDoc,
  onChange,
  values,
  assets,
  onUpload,
  readOnly = false,
  brandLogo,
  brandColours = [],
  allowTemplates = false,
}: {
  document: SignatureDocument;
  onChange: (doc: SignatureDocument) => void;
  values: SignatureValues;
  assets: Record<string, string>;
  onUpload: (file: File) => Promise<{ id: string; url: string }>;
  readOnly?: boolean;
  brandLogo?: { url: string; load: () => Promise<File> };
  /** Saved brand colours, offered first in every colour choice. */
  brandColours?: string[];
  /** Show the template switcher in the canvas toolbar. */
  allowTemplates?: boolean;
}) {
  const [resize, setResize] = useState<{ preview: SignatureDocument; label: string } | null>(null);
  const doc = resize?.preview || savedDoc;
  const resizeSession = useRef<{ base: SignatureDocument; next: SignatureDocument; pointerId: number; startX: number; startWidth: number; rowId: string; blockId?: string; rowWidth: number } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { t } = useLanguage();
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width:760px)").matches
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width:760px)");
    const change = () => setCompact(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const reduced = Boolean(useReducedMotion());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<SignatureDocument[]>([]);
  const [future, setFuture] = useState<SignatureDocument[]>([]);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [picker, setPicker] = useState(false);
  const current = useRef({ doc, onChange });
  current.current = { doc: savedDoc, onChange };
  const gestureBase = useRef<SignatureDocument | null>(null);
  const arrival = useRef<Arrival>(null);
  const skipClick = useRef(false);
  const accent = doc.accent ?? signatureDefaultAccent;
  const location = (() => {
    for (const row of doc.rows) {
      for (let column = 0; column < row.columns.length; column++) {
        const index = row.columns[column].findIndex((b) => b.id === selectedId);
        if (index >= 0) return { row, column, index, block: row.columns[column][index] };
      }
    }
    return null;
  })();
  const selected = location?.block ?? null;

  function commit(next: SignatureDocument, mode: CommitMode = "step") {
    if (readOnly || !mounted.current) return;
    if (mode === "live") {
      gestureBase.current ??= current.current.doc;
      current.current.onChange(next);
      return;
    }
    const base = gestureBase.current ?? current.current.doc;
    gestureBase.current = null;
    setHistory((h) => [...h.slice(-59), base]);
    setFuture([]);
    current.current.onChange(next);
  }
  const commitRef = useRef(commit);
  commitRef.current = commit;
  function undo() {
    const last = history.at(-1);
    if (!last || readOnly) return;
    setFuture((f) => [current.current.doc, ...f]);
    setHistory((h) => h.slice(0, -1));
    onChange(last);
    setAnnouncement(t("Undone"));
  }
  function redo() {
    const next = future[0];
    if (!next || readOnly) return;
    setHistory((h) => [...h, current.current.doc]);
    setFuture((f) => f.slice(1));
    onChange(next);
    setAnnouncement(t("Redone"));
  }
  const historyRef = useRef({ undo, redo });
  historyRef.current = { undo, redo };
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]:not(.sig-properties-sheet)")) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) historyRef.current.redo();
        else historyRef.current.undo();
      } else if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        historyRef.current.redo();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  function beginResize(event: ReactPointerEvent<HTMLElement>, rowId: string, blockId?: string) {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const row = current.current.doc.rows.find((row) => row.id === rowId)!;
    const element = event.currentTarget.closest(".sig-canvas-row")!;
    const block = row.columns.flat().find((block) => block.id === blockId);
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSession.current = {
      base: current.current.doc,
      next: current.current.doc,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: block ? event.currentTarget.closest(".sig-canvas-block")!.getBoundingClientRect().width : signatureColumnWidths(row)[0],
      rowId,
      blockId,
      rowWidth: element.getBoundingClientRect().width,
    };
    setResize({ preview: current.current.doc, label: block ? `${block.width} px` : `${signatureColumnWidths(row)[0]}% / ${signatureColumnWidths(row)[1]}%` });
  }
  useEffect(() => {
    function move(event: PointerEvent) {
      const session = resizeSession.current;
      if (!session || event.pointerId !== session.pointerId) return;
      const delta = event.clientX - session.startX;
      if (session.blockId) {
        session.next = resizeSignatureImage(session.base, session.blockId, session.startWidth + delta);
        const block = session.next.rows.flatMap((row) => row.columns.flat()).find((block) => block.id === session.blockId)!;
        setResize({ preview: session.next, label: `${block.width} px` });
      } else {
        let percent = session.startWidth + delta / session.rowWidth * 100;
        const snap = [25, 33, 50, 67, 75].find((value) => Math.abs(value - percent) < 1.2);
        if (snap !== undefined) percent = snap;
        session.next = resizeSignatureColumn(session.base, session.rowId, percent);
        const widths = signatureColumnWidths(session.next.rows.find((row) => row.id === session.rowId)!);
        setResize({ preview: session.next, label: `${widths[0]}% / ${widths[1]}%` });
      }
    }
    function finish(event?: PointerEvent, cancel = false) {
      const session = resizeSession.current;
      if (!session || event && event.pointerId !== session.pointerId) return;
      resizeSession.current = null;
      setResize(null);
      // A remote edit wins over an in-progress gesture; never replace newer content.
      if (!cancel && current.current.doc === session.base && session.next !== session.base) {
        commitRef.current(session.next);
        setAnnouncement(t("Size updated"));
      }
    }
    function cancel(event: PointerEvent) {
      finish(event, true);
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && resizeSession.current) {
        event.preventDefault();
        finish(undefined, true);
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
  }, [t]);

  function patchBlock(id: string, patch: Partial<SignatureBlock>, mode: CommitMode = "step") {
    const base = current.current.doc;
    const target = base.rows.flatMap((row) => row.columns.flat()).find((block) => block.id === id);
    if (!target) return;
    if (target.kind === "image" && patch.width !== undefined) {
      commit(resizeSignatureImage(base, id, patch.width), mode);
      return;
    }
    commit({
      ...base,
      rows: base.rows.map((row) => ({
        ...row,
        columns: row.columns.map((column) => column.map((block) => block.id === id ? { ...block, ...patch } : block)),
      })),
    }, mode);
  }
  function editBlock(patch: Partial<SignatureBlock>, mode: CommitMode = "step") {
    if (selected) patchBlock(selected.id, patch, mode);
  }
  function editDoc(patch: Partial<SignatureDocument>, mode: CommitMode = "step") {
    commit({ ...current.current.doc, ...patch }, mode);
  }
  function editRow(patch: Partial<SignatureRow>, mode: CommitMode = "step") {
    if (!location) return;
    const base = current.current.doc;
    commit({ ...base, rows: base.rows.map((row) => row.id === location.row.id ? { ...row, ...patch } : row) }, mode);
  }

  function slotAt(x: number, y: number): Slot | null {
    const hit = globalThis.document.elementFromPoint(x, y);
    const canvas = hit?.closest<HTMLElement>(".sig-canvas");
    if (!canvas) return null;
    const cells = [...canvas.querySelectorAll<HTMLElement>("[data-signature-column]")];
    const distance = (item: HTMLElement) => {
      const r = item.getBoundingClientRect();
      return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    };
    const cell = hit?.closest<HTMLElement>("[data-signature-column]") ||
      cells.reduce<HTMLElement | null>((best, item) => !best || distance(item) < distance(best) ? item : best, null);
    if (!cell) return null;
    const blocks = [...cell.querySelectorAll<HTMLElement>(".sig-canvas-block")];
    const index = blocks.findIndex((b) => {
      const r = b.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return { rowId: cell.dataset.rowId!, column: Number(cell.dataset.column), index: index < 0 ? blocks.length : index };
  }
  function startDrag(e: ReactPointerEvent<HTMLElement>, block: SignatureBlock, fresh: boolean) {
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
        angle: reduced ? 0 : Math.max(-5, Math.min(5, d.angle * .55 + (e.clientX - d.x) * .18)),
        started: d.started || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5,
        slot: slotAt(e.clientX, e.clientY),
      };
      dragRef.current = next;
      setDrag(next);
      const scroller = globalThis.document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".sig-canvas-scroll");
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
          commitRef.current(moveSignatureBlock(current.current.doc, d.block, slot, d.fresh));
          setSelectedId(d.block.id);
          setLanded(d.block.id);
          window.setTimeout(() => setLanded(null), 520);
          setAnnouncement(`${t(signatureBlockLabel(d.block))} ${t("placed in signature")}`);
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

  function add(kind: SignaturePaletteKind, source?: HTMLElement) {
    if (skipClick.current || readOnly) return;
    const block = signaturePaletteBlock(kind, accent);
    const base = current.current.doc;
    const selectedSlot = location
      ? { rowId: location.row.id, column: location.column, index: location.index + 1 }
      : null;
    const row = base.rows.at(-1);
    if (source) arrival.current = { id: block.id, rect: source.getBoundingClientRect() };
    if (selectedSlot) {
      commit(moveSignatureBlock(base, block, selectedSlot, true));
    } else if (row) {
      commit(moveSignatureBlock(base, block, { rowId: row.id, column: row.columns.length - 1, index: row.columns.at(-1)!.length }, true));
    } else {
      commit({ ...base, rows: [{ id: crypto.randomUUID(), columns: [[block]] }] });
    }
    setSelectedId(block.id);
    setAnnouncement(`${t(signaturePaletteLabels[kind])} ${t("added")}`);
  }
  function addRow(widths: number[]) {
    const base = current.current.doc;
    const id = crypto.randomUUID();
    commit({
      ...base,
      rows: [...base.rows, { id, columns: widths.map(() => []), ...(widths.length === 2 ? { columnWidths: widths } : {}) }],
    });
    setAnnouncement(t("Row added"));
  }
  const canMove: Record<Direction, boolean> = {
    up: !!location && location.index > 0,
    down: !!location && location.index < location.row.columns[location.column].length - 1,
    left: !!location && location.column > 0,
    right: !!location && location.column < location.row.columns.length - 1,
  };
  function moveSelected(direction: Direction, id = selectedId) {
    const base = current.current.doc;
    const row = base.rows.find((r) => r.columns.some((c) => c.some((b) => b.id === id)));
    if (!row) return;
    const column = row.columns.findIndex((c) => c.some((b) => b.id === id));
    const index = row.columns[column].findIndex((b) => b.id === id);
    const block = row.columns[column][index];
    if (direction === "left" || direction === "right") {
      const target = column + (direction === "left" ? -1 : 1);
      if (!row.columns[target]) return;
      commit(moveSignatureBlock(base, block, { rowId: row.id, column: target, index: row.columns[target].length }));
    } else {
      const target = direction === "up" ? index - 1 : index + 2;
      if (target < 0 || target > row.columns[column].length) return;
      commit(moveSignatureBlock(base, block, { rowId: row.id, column, index: target }));
    }
    setAnnouncement(`${t(signatureBlockLabel(block))} ${t("moved")} ${t(direction)}`);
  }
  function deleteBlock(id = selectedId) {
    if (!id) return;
    setError("");
    const base = current.current.doc;
    commit({ ...base, rows: base.rows.map((r) => ({ ...r, columns: r.columns.map((c) => c.filter((b) => b.id !== id)) })) });
    setSelectedId(null);
    setAnnouncement(t("Block removed. Press Command or Control and Z to undo."));
  }
  function duplicateSelected() {
    if (!location) return;
    const block = { ...structuredClone(location.block), id: crypto.randomUUID() };
    commit(moveSignatureBlock(current.current.doc, block, { rowId: location.row.id, column: location.column, index: location.index + 1 }, true));
    setSelectedId(block.id);
    setLanded(block.id);
    window.setTimeout(() => setLanded(null), 520);
  }
  async function upload(file?: File, targetId = selected?.id) {
    if (!file || !targetId) return;
    setUploading(true);
    setError("");
    try {
      const asset = await onUpload(file);
      // Resolve against the latest document so slow uploads cannot overwrite edits or another block.
      patchBlock(targetId, { assetId: asset.id, alt: file.name.replace(/\.[^.]+$/, "") });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (mounted.current) setUploading(false);
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
        const latest = current.current.doc.rows.flatMap((row) => row.columns.flat()).find((block) => block.id === targetId);
        if (!latest) break;
        patchBlock(targetId, { images: [...(latest.images || []), { assetId: asset.id, alt: file.name.replace(/\.[^.]+$/, ""), href: "" }] });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (mounted.current) setUploading(false);
    }
  }
  async function importBrand(targetId = selected?.id) {
    if (!brandLogo || !targetId) return;
    setError("");
    setUploading(true);
    try {
      const file = await brandLogo.load();
      if (mounted.current) await upload(file, targetId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (mounted.current) setUploading(false);
    }
  }
  async function applyTemplate(next: SignatureDocument) {
    setPicker(false);
    setSelectedId(null);
    commit(next);
    setAnnouncement(t("Template applied. Undo brings your previous design back."));
    if (!brandLogo || !signatureNeedsBrandLogo(next)) return;
    try {
      const asset = await onUpload(await brandLogo.load());
      if (mounted.current) commit(fillSignatureBrandLogo(current.current.doc, asset.id));
    } catch { /* The logo slot stays ready for a manual upload. */ }
  }

  const brandSwatches: Swatch[] = brandColours.filter((value) => hex.test(value)).map((value, index) => ({
    value: value.toLowerCase(),
    label: t(index === 0 ? "Brand primary" : "Brand secondary"),
  }));
  const swatches: Swatch[] = [
    ...brandSwatches,
    { value: accent.toLowerCase(), label: t("Accent") },
    { value: "#1f2a28", label: t("Ink") },
    { value: "#66736f", label: t("Muted") },
    { value: "#dfe5e3", label: t("Soft grey") },
    { value: "#ffffff", label: t("White") },
    { value: "#2f5bd3", label: t("Blue") },
    { value: "#7a4fd6", label: t("Violet") },
    { value: "#c2410c", label: t("Amber") },
    { value: "#b4235a", label: t("Rose") },
  ];
  const backgrounds: Swatch[] = [
    { value: "#ffffff", label: t("White") },
    { value: "#f6f8f7", label: t("Mist") },
    { value: mixSignatureColour(accent, "#ffffff", .93), label: t("Accent tint") },
    { value: "#fbf8f2", label: t("Paper") },
    { value: "#17211f", label: t("Night") },
  ];

  const spring = reduced ? { duration: 0 } : { type: "spring" as const, visualDuration: .26, bounce: .14 };
  const isEmpty = !doc.rows.some((row) => row.columns.some((column) => column.length));
  const propertyPanel = (
    <SignaturePropertiesPanel
      doc={doc}
      block={selected}
      row={location?.row ?? null}
      readOnly={readOnly}
      assets={assets}
      uploading={uploading}
      error={error}
      swatches={swatches}
      backgrounds={backgrounds}
      canMove={canMove}
      onDismissError={() => setError("")}
      editBlock={editBlock}
      editDoc={editDoc}
      editRow={editRow}
      setColumns={(count) => location && commit(setSignatureRowColumns(current.current.doc, location.row.id, count))}
      onRecolour={(value, mode) => commit(recolourSignatureAccent(current.current.doc, value), mode)}
      onUpload={(file) => void upload(file)}
      onUploadBadges={(files) => void uploadBadges(files)}
      onImportBrand={brandLogo ? () => void importBrand() : undefined}
      onClose={() => setSelectedId(null)}
      onDelete={() => deleteBlock()}
      onDuplicate={duplicateSelected}
      onMove={(direction) => moveSelected(direction)}
    />
  );
  const gap = doc.columnGap ?? 20;
  const contentWidth = signatureContentWidth(doc);

  function renderContent(b: SignatureBlock) {
    if (b.kind === "image" && !signatureImageUrl(b, assets)) {
      const role = b.imageRole ?? "image";
      return (
        <div
          className={`sig-image-placeholder is-${role}`}
          style={{
            width: b.width,
            aspectRatio: String(placeholderRatio[role]),
            borderRadius: b.radius ? b.radius >= 999 ? "50%" : b.radius : undefined,
            marginInline: b.align === "center" ? "auto" : b.align === "right" ? "0 0 0 auto" : undefined,
          }}
        >
          <SignatureBlockGlyph kind={role} tile={false} className="size-5" />
          {role !== "photo" || b.width >= 64
            ? <span>{t(role === "logo" ? "Your logo" : role === "photo" ? "Headshot" : role === "banner" ? "Your banner" : "Image")}</span>
            : null}
        </div>
      );
    }
    if (b.kind === "badges" && !(b.images || []).some((image) => assets[image.assetId])) {
      return (
        <div className="sig-badge-placeholder" style={{ justifyContent: b.align === "center" ? "center" : b.align === "right" ? "flex-end" : "flex-start" }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: Math.min(b.width, 56), height: Math.min(b.width, 56) }} />)}
          <em>{t("Upload your trust badges")}</em>
        </div>
      );
    }
    if (b.kind === "socials" && !(b.links || []).some((link) => safeSignatureLink(link.href))) {
      const ghost = renderSignatureBlock({ ...b, links: (b.links || []).map((link) => ({ ...link, href: "https://example.com" })) }, values, assets);
      return (
        <div className="sig-ghost">
          {ghost.html ? <div className="sig-block-output" data-i18n-skip dangerouslySetInnerHTML={{ __html: ghost.html }} /> : null}
          <span className="sig-ghost-note">{t(b.links?.length ? "Add profile links to show these" : "Choose a social profile")}</span>
        </div>
      );
    }
    if (b.field && !values[b.field]) {
      return (
        <div className="sig-field-placeholder">
          {t(signatureFields[b.field])}
          <span>{t("Hidden when empty")}</span>
        </div>
      );
    }
    const rendered = renderSignatureBlock(b, values, assets);
    if (!rendered.html && b.kind === "details") {
      return (
        <div className="sig-field-placeholder">
          {t(b.fields?.length ? "Contact list" : "Choose the details to show")}
          <span>{t("Hidden when empty")}</span>
        </div>
      );
    }
    return <div className="sig-block-output" data-i18n-skip dangerouslySetInnerHTML={{ __html: rendered.html }} />;
  }

  return (
    <div
      className="sig-builder"
      onFocusCapture={(event) => {
        if (!compact || !selectedId) returnFocus.current = event.target as HTMLElement;
      }}
    >
      <aside className="sig-palette" aria-label={t("Signature blocks")}>
        {signaturePaletteGroups.map((group) => (
          <div key={group.label} className="sig-palette-group">
            <div className="sig-palette-heading">{t(group.label)}</div>
            <div className="sig-palette-grid">
              {group.items.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={readOnly}
                  className="sig-palette-item"
                  onPointerDown={(e) => startDrag(e, signaturePaletteBlock(kind, accent), true)}
                  onClick={(e) => add(kind, e.currentTarget.querySelector<HTMLElement>(".signature-block-glyph") ?? e.currentTarget)}
                  aria-label={`${t("Add")} ${t(signaturePaletteLabels[kind])}`}
                >
                  <SignatureBlockGlyph kind={kind} />
                  <span>{t(signaturePaletteLabels[kind])}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="sig-palette-group">
          <div className="sig-palette-heading">{t("Rows")}</div>
          <div className="sig-layout-grid">
            {layoutPresets.map((preset) => (
              <Tooltip key={preset.id}>
                <TooltipTrigger asChild>
                  <button type="button" disabled={readOnly} className="sig-layout-item" aria-label={`${t("Add row")}: ${t(preset.label)}`} onClick={() => addRow(preset.widths)}>
                    {preset.widths.map((width, index) => <span key={index} style={{ flexGrow: width }} />)}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t(preset.label)}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
        <p className="sig-hint sig-palette-hint">
          {t("Drag a block into the signature, or click to add it after the selected block.")}
        </p>
      </aside>
      <section className="sig-canvas-column">
        <div className="sig-canvas-toolbar">
          <div className="flex min-w-0 items-center gap-2">
            {allowTemplates && !readOnly
              ? (
                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-[12px]" onClick={() => setPicker(true)}>
                  <LayoutTemplate className="size-3.5" />
                  {t("Templates")}
                </Button>
              )
              : null}
            <SegmentedControl
              ariaLabel={t("Canvas width")}
              options={["desktop", "mobile"] as const}
              value={device}
              onChange={setDevice}
              className="[&>button]:h-7 [&>button]:px-2"
              renderOption={(value) => {
                const Icon = value === "desktop" ? Laptop : Smartphone;
                return <><Icon className="size-3.5" /><span className="sr-only">{t(value === "desktop" ? "Desktop" : "Mobile")}</span></>;
              }}
            />
          </div>
          <div className="flex items-center gap-1">
            {([["Undo", Undo, undo, !history.length, "⌘Z"], ["Redo", Redo, redo, !future.length, "⇧⌘Z"]] as const).map(([label, Icon, run, disabled, keys]) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-8" disabled={disabled || readOnly} aria-label={t(label)} aria-keyshortcuts={label === "Undo" ? "Meta+Z" : "Meta+Shift+Z"} onClick={run}>
                    <Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t(label)} <span className="opacity-60">{keys}</span></TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
        <div
          className="sig-canvas-scroll"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSelectedId(null);
          }}
        >
          <div className={`sig-sheet ${device === "mobile" ? "is-mobile" : ""}`} style={{ maxWidth: device === "mobile" ? 360 : Math.max(doc.width + 96, 520) }}>
            <div className="sig-email-context" aria-hidden="true">
              <span className="sig-context-line" style={{ width: "30%" }} />
              <span className="sig-context-line" style={{ width: "86%" }} />
              <span className="sig-context-line" style={{ width: "64%" }} />
              <p>{t("Kind regards,")}</p>
            </div>
            <div
              className="sig-canvas"
              style={{
                maxWidth: doc.width,
                background: doc.colour,
                padding: doc.padding ?? 0,
                borderRadius: doc.radius ?? 0,
                fontFamily: signatureFonts[doc.font ?? "arial"].stack,
                "--sig-row-gutter": `${(doc.padding ?? 0) + 10}px`,
              } as CSSProperties}
              aria-label={t("Editable signature")}
            >
              {doc.rows.map((row, rowIndex) => (
                <motion.div
                  layout={!resize}
                  transition={spring}
                  key={row.id}
                  className={`sig-canvas-row ${resize ? "is-resizing" : ""} ${location?.row.id === row.id ? "has-selection" : ""}`}
                  style={{ gap, alignItems: row.valign === "middle" ? "center" : "stretch" }}
                >
                  <div className="sig-row-tools">
                    {(["up", "down"] as const).map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        disabled={readOnly || direction === "up" && rowIndex === 0 || direction === "down" && rowIndex === doc.rows.length - 1}
                        aria-label={`${t("Move row")} ${rowIndex + 1} ${t(direction)}`}
                        onClick={() => {
                          const rows = [...doc.rows];
                          const target = rowIndex + (direction === "up" ? -1 : 1);
                          [rows[rowIndex], rows[target]] = [rows[target], rows[rowIndex]];
                          commit({ ...doc, rows });
                        }}
                      >
                        {direction === "up" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="is-danger"
                      disabled={readOnly}
                      aria-label={`${t("Delete row")} ${rowIndex + 1}`}
                      onClick={() => {
                        setError("");
                        if (location?.row.id === row.id) setSelectedId(null);
                        commit({ ...doc, rows: doc.rows.filter((r) => r.id !== row.id) });
                        setAnnouncement(t("Row removed. Press Command or Control and Z to undo."));
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                  {row.columns.length === 2 && !readOnly
                    ? (
                      <button
                        type="button"
                        role="slider"
                        aria-label={`${t("Column width row")} ${rowIndex + 1}`}
                        aria-valuemin={20}
                        aria-valuemax={80}
                        aria-valuenow={signatureColumnWidths(row)[0]}
                        aria-valuetext={`${signatureColumnWidths(row)[0]}% / ${signatureColumnWidths(row)[1]}%`}
                        className="sig-column-resizer"
                        style={{ left: `calc((100% - ${gap}px) * ${signatureColumnWidths(row)[0] / 100} + ${gap / 2}px)`, width: Math.max(8, Math.min(20, gap)) }}
                        onPointerDown={(event) => beginResize(event, row.id)}
                        onKeyDown={(event) => {
                          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                          event.preventDefault();
                          const value = event.key === "Home" ? 20 : event.key === "End" ? 80 : signatureColumnWidths(row)[0] + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 5 : 1);
                          commit(resizeSignatureColumn(doc, row.id, value));
                        }}
                      >
                        <span className="sig-resize-grip" />
                        <span className="sig-resize-label">
                          {resizeSession.current?.rowId === row.id ? resize?.label : `${signatureColumnWidths(row)[0]}% / ${signatureColumnWidths(row)[1]}%`}
                        </span>
                      </button>
                    )
                    : null}
                  {row.columns.map((column, colIndex) => (
                    <div
                      key={colIndex}
                      className={`sig-canvas-cell ${colIndex > 0 && row.rule ? "has-rule" : ""}`}
                      data-signature-column
                      data-row-id={row.id}
                      data-column={colIndex}
                      style={{
                        flex: `${signatureColumnWidths(row)[colIndex]} 1 0%`,
                        ...(colIndex > 0 && row.rule ? { borderInlineStart: `1px solid ${row.rule}`, paddingInlineStart: gap } : {}),
                      }}
                    >
                      {Array.from({ length: column.length + 1 }, (_, index) => {
                        const b = column[index];
                        const isTarget = drag?.started && drag.slot?.rowId === row.id && drag.slot.column === colIndex && drag.slot.index === index;
                        return (
                          <div key={b?.id || "end"} className={`sig-slot ${column.length === 0 ? "is-empty" : ""}`}>
                            <AnimatePresence>
                              {isTarget
                                ? (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 22, opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: reduced ? 0 : .22, ease: mdEaseOut }}
                                    className="sig-drop-position"
                                    aria-hidden="true"
                                  >
                                    <span />
                                  </motion.div>
                                )
                                : null}
                            </AnimatePresence>
                            {b
                              ? (
                                <motion.div
                                  layout={!resize}
                                  transition={spring}
                                  data-block-id={b.id}
                                  className={`sig-canvas-block ${selectedId === b.id ? "is-selected" : ""} ${landed === b.id ? "is-landed" : ""} ${drag?.started && drag.block.id === b.id ? "is-dragging" : ""}`}
                                  style={b.kind === "image" ? { width: Math.min(b.width, contentWidth), maxWidth: "100%", marginInline: b.align === "center" ? "auto" : b.align === "right" ? "0 0 0 auto" : undefined } : undefined}
                                  tabIndex={0}
                                  role="button"
                                  aria-pressed={selectedId === b.id}
                                  aria-label={`${t("Edit")} ${t(signatureBlockLabel(b))}`}
                                  onPointerDown={(e) => {
                                    if (e.pointerType === "mouse" && !(e.target as HTMLElement).closest("button")) startDrag(e, b, false);
                                  }}
                                  onClick={() => {
                                    if (!skipClick.current) setSelectedId(b.id);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.target !== e.currentTarget) return;
                                    if (e.key === "Delete" || e.key === "Backspace") {
                                      e.preventDefault();
                                      deleteBlock(b.id);
                                    }
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setSelectedId(b.id);
                                    }
                                    if (e.key === "Escape" && selectedId === b.id) setSelectedId(null);
                                    if (e.altKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                                      e.preventDefault();
                                      moveSelected(e.key.slice(5).toLowerCase() as Direction, b.id);
                                    }
                                  }}
                                >
                                  {b.kind === "image" && !readOnly
                                    ? (
                                      <button
                                        type="button"
                                        role="slider"
                                        className="sig-image-resizer"
                                        aria-label={t("Resize image")}
                                        aria-valuemin={24}
                                        aria-valuemax={Math.floor((contentWidth - gap * (row.columns.length - 1)) * (row.columns.length === 2 ? .8 : 1 / row.columns.length))}
                                        aria-valuenow={b.width}
                                        onPointerDown={(event) => {
                                          setSelectedId(b.id);
                                          beginResize(event, row.id, b.id);
                                        }}
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => {
                                          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                                          event.preventDefault();
                                          event.stopPropagation();
                                          commit(resizeSignatureImage(doc, b.id, b.width + (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1) * (event.shiftKey ? 10 : 2)));
                                        }}
                                      >
                                        <span className="sig-resize-label">{b.width} px</span>
                                      </button>
                                    )
                                    : null}
                                  <button
                                    type="button"
                                    className="sig-block-remove"
                                    disabled={readOnly}
                                    aria-label={`${t("Remove block")} ${t(signatureBlockLabel(b))}`}
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
                                    aria-label={`${t("Drag")} ${t(signatureBlockLabel(b))}`}
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      startDrag(e, b, false);
                                    }}
                                  >
                                    <GripVertical className="size-3.5" />
                                  </button>
                                  <FlightIn id={b.id} arrival={arrival} reduced={reduced}>
                                    {renderContent(b)}
                                  </FlightIn>
                                </motion.div>
                              )
                              : !column.length
                              ? (
                                <div className="sig-empty-column">
                                  {isEmpty && rowIndex === 0 && colIndex === 0 && !readOnly
                                    ? (
                                      <div className="sig-quick-start">
                                        <span className="sig-quick-title">{t("Start with the essentials")}</span>
                                        <div className="sig-quick-chips">
                                          {(["identity", "details", "logo"] as const).map((kind) => (
                                            <button key={kind} type="button" className="sig-chip" onClick={(e) => add(kind, e.currentTarget)}>
                                              <SignatureBlockGlyph kind={kind} tile={false} className="size-3.5" />
                                              {t(signaturePaletteLabels[kind])}
                                            </button>
                                          ))}
                                        </div>
                                        {allowTemplates ? <button type="button" className="sig-quick-link" onClick={() => setPicker(true)}>{t("or browse templates")}</button> : null}
                                      </div>
                                    )
                                    : (
                                      <>
                                        <Plus className="size-4" />
                                        <span>{t("Drop a block here")}</span>
                                      </>
                                    )}
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
                  <button type="button" className="sig-empty-column w-full" disabled={readOnly} onClick={() => addRow([100])}>
                    <Plus className="size-4" />
                    {t("Add a row to begin")}
                  </button>
                )
                : null}
            </div>
          </div>
          <p className="sig-canvas-caption">{t("Personal details fill automatically for each sender.")}</p>
        </div>
      </section>
      {compact && selected
        ? (
          <Dialog open onOpenChange={(open) => !open && setSelectedId(null)}>
            <DialogContent
              showCloseButton={false}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (returnFocus.current?.isConnected) returnFocus.current.focus();
              }}
              className="sig-properties-sheet !inset-x-0 !bottom-0 !top-auto !left-0 !translate-x-0 !translate-y-0 !max-w-none max-h-[78dvh] overflow-y-auto rounded-b-none p-0 motion-reduce:animate-none"
            >
              <DialogTitle className="sr-only">{t("Block properties")}</DialogTitle>
              <DialogDescription className="sr-only">{t("Edit this block, then close to return to your signature.")}</DialogDescription>
              {propertyPanel}
            </DialogContent>
          </Dialog>
        )
        : propertyPanel}
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      {allowTemplates
        ? (
          <SignatureTemplatePicker
            open={picker}
            onOpenChange={setPicker}
            mode="replace"
            accent={accent}
            values={values}
            brandLogoUrl={brandLogo?.url}
            onChoose={(next) => void applyTemplate(next)}
          />
        )
        : null}
      {drag?.started
        ? createPortal(
          <div className="sig-drag-overlay" style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY }}>
            <motion.div
              initial={{ scale: reduced ? 1 : .88, opacity: 0 }}
              animate={{ rotate: drag.angle, scale: reduced ? 1 : 1.03, opacity: 1 }}
              transition={{ type: "spring", stiffness: 650, damping: 38, opacity: { duration: .12 } }}
              className="sig-drag-preview"
            >
              <SignatureBlockGlyph kind={signatureBlockGlyph(drag.block)} active />
              <span>{t(signatureBlockLabel(drag.block))}</span>
            </motion.div>
          </div>,
          globalThis.document.body,
        )
        : null}
    </div>
  );
}
