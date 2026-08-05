/* Media slots.

   Every product visual on the site is a slot rather than a drawing. Give a slot
   a `src` and it renders an <img> at a locked aspect ratio; leave `src` out and
   it renders a designed placeholder that states which screenshot belongs there
   and what should be on screen when it is taken.

   Either way the space is reserved before paint, so swapping a placeholder for a
   real screenshot changes nothing about the layout.

   To fill one in: drop the file into public/assets/shots/ and add `src` to the
   slot's call, e.g. src: "/assets/shots/bookings-register.png". */

import { icon } from "./icons.mjs";

const cls = (...names) => names.filter(Boolean).join(" ");

/* The product mark reduced to its three offset decks — the site's one motif. */
export function deck({ rise = false, className = "" } = {}) {
  return `<span class="${cls("deck", rise && "deck-rise", className)}" aria-hidden="true"><i></i><i></i><i></i></span>`;
}

/**
 * @param {{
 *   src?: string,            // screenshot path; omit for a placeholder
 *   alt?: string,            // required whenever src is set
 *   label: string,           // what this screenshot is
 *   note?: string,           // what should be on screen in it
 *   ratio?: string,          // "16/10", "21/9", "4/3", "3/4"…
 *   caption?: string,        // visible caption under the frame
 *   captionMeta?: string,    // right-aligned caption metadata
 *   flat?: boolean,          // lighter elevation
 *   tight?: boolean,         // smaller corner radius
 *   wipe?: boolean,          // clip reveal on scroll
 *   priority?: boolean,      // eager-load (above the fold only)
 *   className?: string,
 * }} config
 */
export function shot({
  src,
  alt,
  label,
  note,
  ratio = "16 / 10",
  caption,
  captionMeta,
  flat = false,
  tight = false,
  wipe = true,
  priority = false,
  className = "",
}) {
  const ar = `--ar:${ratio.replace("/", " / ")}`;

  const inner = src
    ? `<img
        class="frame-media"
        style="${ar}"
        src="${src}"
        alt="${alt || label}"
        ${priority ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}
        decoding="async"
      >`
    : `<div class="slot" style="${ar}" role="img" aria-label="${label}${note ? `. ${note}` : ""}">
        <div class="slot-inner">
          ${deck()}
          <p class="slot-title">${label}</p>
          ${note ? `<p class="slot-note">${note}</p>` : ""}
          <span class="slot-chip">${icon("image", { size: 12 })} screenshot · ${ratio.replace(/\s/g, "")}</span>
        </div>
      </div>`;

  return `<figure style="margin:0" class="${className}">
      <div class="${cls("frame", flat && "frame-flat", tight && "frame-tight", wipe && "frame-wipe")}">
        <span class="frame-corner">${deck()}</span>
        ${inner}
      </div>
      ${
        caption
          ? `<figcaption class="frame-cap"><b>${caption}</b>${
              captionMeta ? `<span>${captionMeta}</span>` : ""
            }</figcaption>`
          : ""
      }
    </figure>`;
}

/* --------------------------------------------------------------- lane ticker */

/* Real lanes and modes a forwarding desk works. Domain texture, not ornament —
   and the one place on the page where movement is the point. */
const lanes = [
  ["Yantian", "Felixstowe", "Ocean"],
  ["Ningbo", "Rotterdam", "Ocean"],
  ["Shanghai", "Long Beach", "Ocean"],
  ["Tilbury", "Hamburg", "Groupage"],
  ["Jebel Ali", "Felixstowe", "Ocean"],
  ["Izmir", "Southampton", "Road"],
  ["Qingdao", "Felixstowe", "Ocean"],
  ["Hong Kong", "Heathrow", "Air"],
  ["Newark", "Liverpool", "Ocean"],
  ["Singapore", "Antwerp", "Ocean"],
];

export function ticker() {
  const run = lanes
    .map(
      ([from, to, mode]) =>
        `<span class="ticker-item"><b>${from}</b> → <b>${to}</b> <span style="opacity:.72">${mode}</span></span>`,
    )
    .join("");

  /* Two identical runs: the first translates fully out while the second takes its
     place, so the loop is seamless without measuring anything. */
  return `<div class="ticker" aria-hidden="true">
      <div class="ticker-run">${run}</div>
      <div class="ticker-run">${run}</div>
    </div>`;
}
