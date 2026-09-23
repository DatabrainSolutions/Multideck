import { useEffect, useId, useState } from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import "./value-slider.css";

/**
 * A labelled range with an editable readout. `onChange` follows the pointer;
 * `onCommit` fires once when the gesture or typed value settles, so a caller
 * can record one undo step per adjustment.
 */
export function ValueSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  marks = [],
  disabled = false,
  onChange,
  onCommit,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Values drawn as ticks on the track; the thumb lights them as it passes. */
  marks?: number[];
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  className?: string;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next / step) * step));
  useEffect(() => {
    if (!dragging) return;
    const end = () => setDragging(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragging]);
  function commitDraft() {
    if (draft === null) return;
    const parsed = Number.parseFloat(draft);
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    const next = clamp(parsed);
    if (next !== value) {
      onChange(next);
      onCommit?.(next);
    }
  }
  return (
    <div
      className={cn("value-slider", disabled && "is-disabled", className)}
      data-dragging={dragging ? "" : undefined}
    >
      <div className="value-slider-head">
        <label htmlFor={`${id}-thumb`}>{label}</label>
        <span className="value-slider-readout">
          <input
            aria-label={`${label} value`}
            inputMode="numeric"
            disabled={disabled}
            value={draft ?? String(value)}
            size={Math.max(2, String(draft ?? value).length)}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.target.value.replace(/[^\d.-]/g, ""))}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraft();
              } else if (event.key === "Escape") {
                setDraft(null);
              } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                const next = clamp(value + (event.key === "ArrowUp" ? 1 : -1) * step * (event.shiftKey ? 10 : 1));
                setDraft(null);
                onChange(next);
                onCommit?.(next);
              }
            }}
          />
          {unit ? <span aria-hidden="true">{unit}</span> : null}
        </span>
      </div>
      <SliderPrimitive.Root
        className="value-slider-root"
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onPointerDown={() => setDragging(true)}
        onValueChange={([next]) => onChange(next)}
        onValueCommit={([next]) => onCommit?.(next)}
      >
        <SliderPrimitive.Track className="value-slider-track">
          <SliderPrimitive.Range className="value-slider-range" />
        </SliderPrimitive.Track>
        {marks.filter((mark) => mark > min && mark < max).map((mark) => (
          <span
            key={mark}
            aria-hidden="true"
            className="value-slider-mark"
            data-passed={value >= mark ? "" : undefined}
            style={{ left: `${((mark - min) / (max - min)) * 100}%` }}
          />
        ))}
        <SliderPrimitive.Thumb id={`${id}-thumb`} className="value-slider-thumb" aria-label={label}>
          <span className="value-slider-bubble" aria-hidden="true">{value}{unit}</span>
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Root>
    </div>
  );
}
