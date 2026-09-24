import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Plus } from "@/components/icons/hugeicons";
import { mdMotion, reduceMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import "./swatch-picker.css";

const hexPattern = /^#[0-9a-f]{6}$/i;
function readableOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b > .45 ? "#1f2a28" : "#ffffff";
}

/**
 * A fixed row of colours plus a custom picker and hex field. Swatches commit at once;
 * the native picker streams through `onChange` and settles with `onCommit`.
 */
export function SwatchPicker({
  label,
  value,
  swatches,
  onChange,
  onCommit,
  disabled = false,
  className,
}: {
  label: string;
  value: string;
  swatches: { value: string; label: string }[];
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  const picker = useRef<HTMLInputElement>(null);
  const [hex, setHex] = useState<string | null>(null);
  const normalised = value.toLowerCase();
  const options = swatches.filter((swatch, index, all) =>
    all.findIndex((other) => other.value.toLowerCase() === swatch.value.toLowerCase()) === index
  );
  const custom = !options.some((swatch) => swatch.value.toLowerCase() === normalised);
  useEffect(() => {
    const input = picker.current;
    if (!input || !onCommit) return;
    const settle = () => onCommit(input.value);
    input.addEventListener("change", settle);
    return () => input.removeEventListener("change", settle);
  }, [onCommit]);
  function choose(next: string) {
    onChange(next);
    onCommit?.(next);
  }
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    choose(options[next].value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  }
  function commitHex() {
    if (hex === null) return;
    const next = hex.startsWith("#") ? hex : `#${hex}`;
    setHex(null);
    if (hexPattern.test(next) && next.toLowerCase() !== normalised) choose(next.toLowerCase());
  }
  const selectedIndex = options.findIndex((swatch) => swatch.value.toLowerCase() === normalised);
  return (
    <div className={cn("swatch-picker", disabled && "is-disabled", className)}>
      <div className="swatch-picker-head">
        <span id={`${id}-label`}>{label}</span>
        <input
          className="swatch-picker-hex"
          aria-label={`${label} hex value`}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          value={hex ?? value.toUpperCase()}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setHex(event.target.value.trim())}
          onBlur={commitHex}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitHex();
            if (event.key === "Escape") setHex(null);
          }}
        />
      </div>
      <div className="swatch-picker-row" role="radiogroup" aria-labelledby={`${id}-label`}>
        {options.map((swatch, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={swatch.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={swatch.label}
              title={swatch.label}
              tabIndex={selected || (selectedIndex < 0 && index === 0) ? 0 : -1}
              disabled={disabled}
              className="swatch-picker-swatch"
              style={{ background: swatch.value }}
              onClick={() => choose(swatch.value)}
              onKeyDown={(event) => move(event, index)}
            >
              {selected
                ? (
                  <motion.span
                    layoutId={`${id}-ring`}
                    className="swatch-picker-ring"
                    transition={reduceMotion(Boolean(reduced), mdMotion.snap)}
                  />
                )
                : null}
              <Check
                className="swatch-picker-check"
                data-visible={selected ? "" : undefined}
                style={{ color: readableOn(swatch.value) }}
                strokeWidth={2.4}
              />
            </button>
          );
        })}
        <label
          className={cn("swatch-picker-swatch swatch-picker-custom", custom && "is-custom")}
          title="Custom colour"
          style={custom ? { background: value } : undefined}
        >
          {custom
            ? <motion.span layoutId={`${id}-ring`} className="swatch-picker-ring" transition={reduceMotion(Boolean(reduced), mdMotion.snap)} />
            : <Plus className="size-3" strokeWidth={2} />}
          <input
            ref={picker}
            type="color"
            className="sr-only"
            aria-label={`${label}: custom colour`}
            disabled={disabled}
            value={hexPattern.test(value) ? value : "#000000"}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
