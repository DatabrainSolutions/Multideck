"use client";

import { cn } from "@/lib/utils";
import type { CSSProperties, ElementType } from "react";
import { createElement, memo } from "react";
import "./shimmer.css";

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
  disabled?: boolean;
}

/** React Bits ShinyText-style sweep using the existing semantic theme colours.
 * CSS keeps the sweep's phase intact when a real activity updates the label.
 */
export const Shimmer = memo(function Shimmer({
  children, as: Component = "span", className, duration = 2.4, spread = 2, disabled = false,
}: TextShimmerProps) {
  return createElement(Component, {
    className: cn("md-text-shimmer", className),
    "data-disabled": disabled || undefined,
    style: {
      "--shimmer-duration": `${Math.max(1, duration)}s`,
      "--shimmer-spread": `${Math.min(28, Math.max(8, spread * 8))}%`,
    } as CSSProperties,
  }, children);
});
