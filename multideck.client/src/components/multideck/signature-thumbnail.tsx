import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Rendered email signature HTML scaled to fit its box. Measurement happens before
 * paint, so the thumbnail never flashes at full size first.
 */
export function SignatureThumbnail({
  html,
  width,
  height,
  padding = 20,
  className,
}: {
  html: string;
  /** The signature's own width in pixels. */
  width: number;
  /** Fixed box height. Omit to follow the scaled content. */
  height?: number;
  padding?: number;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, contentHeight: 0 });
  useLayoutEffect(() => {
    const box = outer.current, content = inner.current;
    if (!box || !content) return;
    const measure = () => {
      const available = box.clientWidth - padding * 2;
      const scale = available > 0 ? Math.min(1, available / width) : 1;
      const contentHeight = content.offsetHeight;
      setFit((current) =>
        Math.abs(current.scale - scale) < .001 && current.contentHeight === contentHeight ? current : { scale, contentHeight }
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, [width, padding]);
  const scaledHeight = fit.contentHeight * fit.scale;
  const boxHeight = height ?? scaledHeight + padding * 2;
  const overflow = height !== undefined && scaledHeight > height - padding * 2;
  const top = height === undefined || overflow ? padding : (height - scaledHeight) / 2;
  return (
    <div
      ref={outer}
      aria-hidden="true"
      data-i18n-skip
      className={cn("signature-thumbnail", overflow && "is-clipped", className)}
      style={{ height: boxHeight }}
    >
      <div
        ref={inner}
        className="signature-thumbnail-content"
        style={{ width, top, transform: `translateX(-50%) scale(${fit.scale})` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
