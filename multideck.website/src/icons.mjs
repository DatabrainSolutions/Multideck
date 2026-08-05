/* Inline icon set.

   The app draws its icons from lucide; these are the same shapes at the same
   1.6 stroke weight, inlined so the site makes no icon request and nothing
   shifts while an icon font or sprite loads. Every icon is decorative here —
   the accompanying text carries the meaning — so they are aria-hidden. */

const paths = {
  ship: '<path d="M2 20a3 3 0 0 0 2.6-1.5A3 3 0 0 1 7.2 17a3 3 0 0 1 2.6 1.5 3 3 0 0 0 5.2 0A3 3 0 0 1 17.6 17a3 3 0 0 1 2.6 1.5A3 3 0 0 0 22 20"/><path d="M4 14V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5"/><path d="M9 7V4h6v3"/><path d="M12 14v-4"/>',
  plane:
    '<path d="M17.8 19.8 16 14l-4-1.5V19l-2 2v-2.5L8 17l-.5-2.5L3 13l1-2 4.5 1.2L11 9V4.5a1.5 1.5 0 0 1 3 0V9l2.5 3.2L21 11l1 2-4.5 1.5Z"/>',
  truck:
    '<path d="M14 17V6a1 1 0 0 0-1-1H2v12h1"/><path d="M14 9h4.6a1 1 0 0 1 .9.6L22 15v2h-1"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M8 17h7"/>',
  users:
    '<path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7" r="3.4"/><path d="M22 20v-1.5a4 4 0 0 0-3-3.8"/><path d="M16 4.2a3.4 3.4 0 0 1 0 6.6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
  shield:
    '<path d="M12 21s7-3.2 7-9V5.6L12 3 5 5.6V12c0 5.8 7 9 7 9Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  radar:
    '<path d="M20.2 8.4A9 9 0 1 0 12 21a9 9 0 0 0 9-9"/><path d="M15.8 11.2A4 4 0 1 0 12 16a4 4 0 0 0 4-4"/><path d="M12 12 19 5"/><circle cx="12" cy="12" r="1"/>',
  sparkles:
    '<path d="M11 3.5 12.6 8 17 9.6 12.6 11.2 11 15.7 9.4 11.2 5 9.6 9.4 8Z"/><path d="M18 14.5 18.8 17l2.4.9-2.4.9L18 22.2l-.8-2.5-2.4-.9 2.4-.9Z"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  checkSmall: '<path d="m4 8.5 3 3 7-7.5"/>',
  alert:
    '<path d="M10.3 3.9 2.6 17.2A1.9 1.9 0 0 0 4.3 20h15.4a1.9 1.9 0 0 0 1.7-2.8L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 16.5h.01"/>',
  arrowRight: '<path d="M4.5 12h14"/><path d="m13 6.5 5.5 5.5L13 17.5"/>',
  chevronDown: '<path d="m5 8.5 5 5 5-5"/>',
  chevronRight: '<path d="m8.5 5 5 5-5 5"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.6"/><path d="m20 20-4.7-4.7"/>',
  mail: '<rect x="2.5" y="5" width="19" height="14" rx="2.4"/><path d="m3.5 7 7.4 5.4a2 2 0 0 0 2.2 0L20.5 7"/>',
  layers:
    '<path d="M12 2.8 3 7.4l9 4.6 9-4.6Z"/><path d="m3 12.4 9 4.6 9-4.6"/><path d="m3 17 9 4.6L21 17"/>',
  workflow:
    '<rect x="3" y="3" width="7" height="6" rx="1.6"/><rect x="14" y="15" width="7" height="6" rx="1.6"/><path d="M6.5 9v4a3 3 0 0 0 3 3h4.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 2"/>',
  building:
    '<path d="M5 21V4.6A1.6 1.6 0 0 1 6.6 3h6.8A1.6 1.6 0 0 1 15 4.6V21"/><path d="M15 9h2.9A1.6 1.6 0 0 1 19.5 10.6V21"/><path d="M3 21h18"/><path d="M8.5 7.5h3"/><path d="M8.5 11.5h3"/><path d="M8.5 15.5h3"/>',
  receipt:
    '<path d="M5 21V4.6A1.6 1.6 0 0 1 6.6 3h10.8A1.6 1.6 0 0 1 19 4.6V21l-3.5-2-3.5 2-3.5-2Z"/><path d="M9 8h6"/><path d="M9 12h6"/>',
  box: '<path d="M20.5 7.6v8.8a1.8 1.8 0 0 1-.9 1.6l-6.7 3.7a1.8 1.8 0 0 1-1.8 0l-6.7-3.7a1.8 1.8 0 0 1-.9-1.6V7.6"/><path d="m3.8 6.6 7.4-3.9a1.8 1.8 0 0 1 1.6 0l7.4 3.9-8.2 4.4Z"/><path d="M12 11v10"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3.2 9.6h17.6"/><path d="M3.2 14.4h17.6"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
  gauge: '<path d="M12 14 16.5 8.5"/><path d="M3.4 17.5a9 9 0 1 1 17.2 0"/><circle cx="12" cy="14" r="1.4"/>',
  listChecks:
    '<path d="m3 5.5 1.8 1.8L8 4"/><path d="m3 12.5 1.8 1.8L8 11"/><path d="m3 19.5 1.8 1.8L8 18"/><path d="M11.5 6h9.5"/><path d="M11.5 13h9.5"/><path d="M11.5 20h9.5"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9"/><path d="M10.3 19a2 2 0 0 0 3.4 0"/>',
  menu: '<path d="M3.5 7h17"/><path d="M3.5 12h17"/><path d="M3.5 17h17"/>',
  close: '<path d="m5.5 5.5 13 13"/><path d="m18.5 5.5-13 13"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
  pin: '<path d="M20 10.5c0 5.4-8 11-8 11s-8-5.6-8-11a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10.3" r="2.9"/>',
  spreadsheet:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M9.5 9.5V20"/><path d="M3 15h18"/>',
  browser:
    '<rect x="2.5" y="4" width="19" height="16" rx="2.2"/><path d="M2.5 8.5h19"/><path d="M6 6.3h.01"/><path d="M8.6 6.3h.01"/>',
  filePlus:
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M12 11.5v5"/><path d="M9.5 14h5"/>',
  pencil:
    '<path d="M15.6 4.4a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L9.4 19.6 4 21l1.4-5.4Z"/><path d="m14.2 5.8 4 4"/>',
  send: '<path d="M21 3 3 10.5l7 3 3 7Z"/><path d="m10 13.5 4.5-4.5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>',
  refresh:
    '<path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.5"/><path d="M3.5 12A8.5 8.5 0 0 1 18.1 6.1L20.5 8.5"/><path d="M20.5 4v4.5H16"/><path d="M3.5 20v-4.5H8"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3.2"/>',
  image:
    '<rect x="3" y="4.5" width="18" height="15" rx="2.2"/><circle cx="8.6" cy="10" r="1.6"/><path d="m3.6 17.5 4.6-4.2a2 2 0 0 1 2.7 0l5 4.6"/><path d="m14.5 14.2 1.8-1.6a2 2 0 0 1 2.7 0l1.4 1.3"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/>',
  /* A document that has been read and checked, rather than four scanner corners —
     the corner brackets collapse into an X at nav-icon sizes. */
  scanText:
    '<path d="M14.4 3H7.5A2 2 0 0 0 5.5 5v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7.6Z"/><path d="M14.4 3v4.6h4.1"/><path d="m8.7 13 1.7 1.7 3.5-3.7"/>',
  shipWheel:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6"/><path d="M12 15v6"/><path d="M3 12h6"/><path d="M15 12h6"/>',
};

/**
 * @param {keyof typeof paths} name
 * @param {{size?: number, stroke?: number, className?: string, fill?: boolean}} [options]
 */
export function icon(name, options = {}) {
  const body = paths[name];
  if (!body) throw new Error(`Unknown icon: ${name}`);
  const size = options.size ?? 16;
  const stroke = options.stroke ?? 1.6;
  const cls = options.className ? ` class="${options.className}"` : "";
  const paint = options.fill
    ? `fill="currentColor" stroke="none"`
    : `fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" ${paint} aria-hidden="true" focusable="false">${body}</svg>`;
}

/* The product mark: the exact three paths from the approved app SVG. Keeping
   the paths inline lets the navbar animate the real mark without swapping or
   remounting artwork on hover. */
export function logoMark({ size = 24, className = "brand-mark" } = {}) {
  return `<svg class="${className}" width="${size}" height="${(size * 159.85) / 217.35}" viewBox="6.32 35.07 217.35 159.85" aria-hidden="true" focusable="false">
  <path class="brand-mark__deck brand-mark__deck--top" opacity="0.35" d="M161.719 43.125H25.1562C19.2019 43.125 14.375 47.9519 14.375 53.9062V75.4688C14.375 81.4231 19.2019 86.25 25.1562 86.25H161.719C167.673 86.25 172.5 81.4231 172.5 75.4688V53.9062C172.5 47.9519 167.673 43.125 161.719 43.125Z" fill="currentColor"/>
  <path class="brand-mark__deck brand-mark__deck--middle" opacity="0.65" d="M183.281 93.4375H46.7188C40.7644 93.4375 35.9375 98.2644 35.9375 104.219V125.781C35.9375 131.736 40.7644 136.562 46.7188 136.562H183.281C189.236 136.562 194.062 131.736 194.062 125.781V104.219C194.062 98.2644 189.236 93.4375 183.281 93.4375Z" fill="currentColor"/>
  <path class="brand-mark__deck brand-mark__deck--bottom" d="M204.844 143.75H68.2812C62.3269 143.75 57.5 148.577 57.5 154.531V176.094C57.5 182.048 62.3269 186.875 68.2812 186.875H204.844C210.798 186.875 215.625 182.048 215.625 176.094V154.531C215.625 148.577 210.798 143.75 204.844 143.75Z" fill="#0E7D74"/>
</svg>`;
}
