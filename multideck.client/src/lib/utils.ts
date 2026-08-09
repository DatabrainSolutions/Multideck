import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Radix counts a nested popper (a select, a date picker, a popover opened from
 * inside another one) as an interaction outside its parent, which would close
 * the panel someone is still working in. Guard `onInteractOutside` with this.
 */
export function isInsideFloatingLayer(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest("[data-radix-popper-content-wrapper],[data-slot=popover-content],[data-slot=select-content]"))
}
