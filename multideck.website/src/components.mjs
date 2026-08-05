/* Page-level compositions.

   The building blocks are deliberately few and strongly characterised: a marked
   section head, a numbered line of six steps, a pinned media sequence, a ledger,
   and the enquiry moment. Pages compose those rather than inventing new shapes,
   which is what gives the site one voice across nine URLs. */

import { features, site } from "../site.config.mjs";
import { featureHref, featureIcon } from "./layout.mjs";
import { icon } from "./icons.mjs";
import { deck, shot } from "./media.mjs";

const cls = (...names) => names.filter(Boolean).join(" ");

export const arrow = (size = 15) => icon("arrowRight", { size, className: "glyph" });

/* -------------------------------------------------------------- section mark */

/* A full-bleed hairline with the section index on it. Repeated on every section
   so the page reads as a numbered document. */
export function secMark({ index, label, end }) {
  return `<div class="sec-mark rv">
      <span class="label label-n">${index ? `${index} · ` : ""}${label}</span>
      <hr class="rule">
      ${end ? `<span class="label label-quiet">${end}</span>` : deck({ rise: true })}
    </div>`;
}

/* --------------------------------------------------------------- headings -- */

/* A heading revealed line by line. Pass the lines; do not pass a whole string,
   because the reveal has to know where the breaks are. */
export function lines(parts, { className = "d2", tag = "h2" } = {}) {
  const body = parts
    .map((part, index) => `<span><span style="--i:${index}">${part}</span></span>`)
    .join("");
  return `<${tag} class="${cls(className, "lines")}">${body}</${tag}>`;
}

export function secHead({ index, label, title, lede, aside, tag = "h2", titleClass = "d2" }) {
  const heading = Array.isArray(title) ? lines(title, { className: titleClass, tag }) : `<${tag} class="${titleClass}">${title}</${tag}>`;

  const left = `<div class="stack gap-5">
      ${heading}
      ${lede ? `<p class="lede">${lede}</p>` : ""}
    </div>`;

  return `${index || label ? secMark({ index, label }) : ""}
    ${aside ? `<div class="sec-split">${left}<div class="stack gap-5 rv">${aside}</div></div>` : `<div class="rv">${left}</div>`}`;
}

/* ------------------------------------------------- the line: six named steps */

/* Each step is one real handoff in a freight job and links to the page that owns
   it. The sample datum is the same shipment moving along, so it reads as one job
   rather than six products. */
const steps = [
  {
    slug: "sales-crm",
    name: "The enquiry lands",
    owner: "Sales & CRM",
    desc: "It gets qualified, priced from your own charge lines, and owned by a named person with a date against it.",
  },
  {
    slug: "bookings",
    name: "The quote becomes a job",
    owner: "Bookings",
    desc: "Charges, parties, equipment, and references carry across. Nobody retypes a booking that was already agreed.",
  },
  {
    slug: "document-extraction",
    name: "The paperwork reads itself",
    owner: "AutoDoc",
    desc: "Invoices, packing lists, bills of lading, and a photo of a CMR are matched to the job and checked against it.",
  },
  {
    slug: "customs",
    name: "The entry is prepared",
    owner: "Customs",
    desc: "Declarations start from the record rather than a blank form, and anything that would become a hold surfaces first.",
  },
  {
    slug: "live-tracking",
    name: "The freight moves",
    owner: "Live Tracking",
    desc: "Milestones, delays, and free-time risk update against the same job, with the cost of waiting attached.",
  },
  {
    slug: "dexter",
    name: "The customer already knows",
    owner: "Dexter",
    desc: "Each change becomes a customer-ready update in your own words, drafted for the owner to approve and send.",
  },
];

export function line({ current } = {}) {
  const rows = steps
    .map(
      (step, index) => `<a class="line-step rv" style="--d:${index * 40}ms" href="${featureHref(step.slug)}"${
        step.slug === current ? ' data-current="true" aria-current="page"' : ""
      }>
        <span class="line-n">${String(index + 1).padStart(2, "0")}</span>
        <span>
          <span class="line-name">${step.name}</span>
          <span class="line-owner">${step.owner}</span>
        </span>
        <span class="line-desc">${step.desc}</span>
        <span class="line-go">${arrow(17)}</span>
      </a>`,
    )
    .join("");

  return `<div class="line">${rows}</div>`;
}

/* -------------------------------------------------------- pinned sequence -- */

/**
 * Media pins on one side while copy scrolls past on the other.
 * @param {{media: string, blocks: {label: string, title: string, text: string, link?: {href: string, label: string}}[]}} config
 */
export function pinned({ media, blocks }) {
  const copy = blocks
    .map(
      (block, index) => `<div class="pin-block rv">
        <p class="pin-index"><b>${String(index + 1).padStart(2, "0")}</b> ${block.label}</p>
        <h3 class="d4">${block.title}</h3>
        <p class="body">${block.text}</p>
        ${block.link ? `<p><a class="go" href="${block.link.href}">${block.link.label} ${arrow()}</a></p>` : ""}
      </div>`,
    )
    .join("");

  return `<div class="pin">
      <div class="pin-media">${media}</div>
      <div class="pin-copy">${copy}</div>
    </div>`;
}

/* -------------------------------------------------------------------- duo -- */

export function duo({ label, title, body, outcomes, link, media, flip = false }) {
  return `<div class="duo rv" data-flip="${flip}">
      <div class="duo-copy">
        ${label ? `<p class="label">${label}</p>` : ""}
        <h3 class="d3">${title}</h3>
        ${body ? `<p class="body">${body}</p>` : ""}
        ${outcomes ? outcomeList(outcomes) : ""}
        ${link ? `<p><a class="go" href="${link.href}">${link.label} ${arrow()}</a></p>` : ""}
      </div>
      <div class="duo-media">${media}</div>
    </div>`;
}

export function outcomeList(items) {
  const rows = items
    .map(
      (item) => `<li class="outcome">
        <span class="outcome-icon">${icon(item.icon || "checkSmall", { size: 18, stroke: 1.9 })}</span>
        <span class="outcome-title">${item.title}</span>
        <span class="outcome-text">${item.text}</span>
      </li>`,
    )
    .join("");
  return `<ul class="outcomes">${rows}</ul>`;
}

/* ----------------------------------------------------------------- ledger -- */

export function ledger(items) {
  const rows = items
    .map(
      (item, index) => `<div class="ledger-row rv" style="--d:${index * 50}ms">
        <span class="ledger-n">${String(index + 1).padStart(2, "0")}</span>
        <p class="ledger-term">${item.term}</p>
        <p class="ledger-text">${item.text}</p>
      </div>`,
    )
    .join("");
  return `<div class="ledger">${rows}</div>`;
}

export function results(items) {
  const rows = items
    .map(
      (item, index) => `<div class="result rv" style="--d:${index * 60}ms">
        <span class="result-value">${item.value}</span>
        <span class="result-label">${item.label}</span>
      </div>`,
    )
    .join("");
  return `<div class="results">${rows}</div>`;
}

/* -------------------------------------------------------------- page hero -- */

export function pageHero({ crumbs = [], label, title, lede, aside, actions }) {
  const crumbMarkup = crumbs.length
    ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs
        .map((crumb, index) =>
          index === crumbs.length - 1
            ? `<span>${crumb.label}</span>`
            : `<a href="${crumb.href}">${crumb.label}</a>${icon("chevronRight", {
                size: 12,
                className: "glyph",
              })}`,
        )
        .join("")}</nav>`
    : "";

  return `<section class="phero">
      <div class="shell">
        ${crumbMarkup}
        <div class="phero-grid">
          <div class="stack gap-6">
            ${label ? `<p class="label rv">${label}</p>` : ""}
            ${Array.isArray(title) ? lines(title, { className: "d2", tag: "h1" }) : `<h1 class="d2">${title}</h1>`}
            <p class="lede rv" style="--d:120ms">${lede}</p>
            ${actions ? `<div class="inline rv" style="--d:180ms;gap:12px">${actions}</div>` : ""}
          </div>
          ${aside ? `<div class="rv" style="--d:240ms">${aside}</div>` : ""}
        </div>
      </div>
    </section>`;
}

/* ------------------------------------------------------------- statement -- */

/* A dark full-bleed beat. One per page, used where the argument needs air. */
export function statementBand({ label, statement, body, link, media }) {
  return `<section class="band dark band-y">
      <div class="shell">
        ${secMark({ label, end: "Multideck" })}
        <div class="sec-split sec-split-top">
          <p class="statement rv on-dark">${statement}</p>
          <div class="stack gap-5 rv" style="--d:100ms">
            ${body.map((paragraph) => `<p class="body">${paragraph}</p>`).join("")}
            ${link ? `<p><a class="go" href="${link.href}">${link.label} ${arrow()}</a></p>` : ""}
          </div>
        </div>
        ${media ? `<div class="rv" style="margin-block-start:clamp(40px,5vw,72px)">${media}</div>` : ""}
      </div>
    </section>`;
}

/* --------------------------------------------------------------- enquiry -- */

const volumes = [
  "Under 100 shipments a month",
  "100–500 shipments a month",
  "500–2,000 shipments a month",
  "Over 2,000 shipments a month",
];

export function enquirySection({
  title = "Tell us how your team runs freight today",
  lede = "We will show you Multideck against your own lanes, your own paperwork, and your own handoffs, not a generic demo tenant.",
  titleClass = "d2",
  sectionClass = "",
  showAudience = true,
  showMark = true,
} = {}) {
  const options = volumes.map((volume) => `<option value="${volume}">${volume}</option>`).join("");
  const tick = icon("checkSmall", { size: 14, stroke: 2.1 });

  return `<section class="band dark band-y ${sectionClass}" id="enquire">
      <div class="shell">
        ${showMark ? secMark({ index: "07", label: "Enquire", end: "Reply within one working day" }) : ""}
        <div class="enq">
          <div class="stack gap-8">
            <div class="stack gap-5">
              ${lines([title], { className: titleClass })}
              <p class="lede rv">${lede}</p>
            </div>

            ${showAudience ? `<div class="rv">
              <p class="label label-quiet" style="margin-block-end:14px">Built for</p>
              <ul class="chips">
                <li>${tick}Freight forwarders</li>
                <li>${tick}Customs brokers</li>
                <li>${tick}NVOCCs and groupage operators</li>
                <li>${tick}Road and domestic haulage desks</li>
              </ul>
            </div>` : ""}

            <div class="rv">
              <p class="label label-quiet" style="margin-block-end:8px">What happens next</p>
              <ol class="steps">
                <li class="step">
                  <div>
                    <p class="step-title">We reply within ${site.responseWindow}</p>
                    <p class="step-text">A short note back from someone who knows the product, not an automated sequence.</p>
                  </div>
                </li>
                <li class="step">
                  <div>
                    <p class="step-title">A 30-minute working session</p>
                    <p class="step-text">You walk us through one real job end to end. We show you where Multideck would hold it.</p>
                  </div>
                </li>
                <li class="step">
                  <div>
                    <p class="step-title">A workspace with your lanes in it</p>
                    <p class="step-text">If it fits, we set up a trial workspace using your references, ports, and document types.</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>

          <form
            class="enq-form rv"
            data-enquiry-form
            data-mailto="${site.enquiryEmail}"
            ${site.enquiryEndpoint ? `action="${site.enquiryEndpoint}" method="post"` : ""}
          >
            <div class="stack gap-4">
              <div class="enq-pair">
                <div class="field">
                  <label class="field-label" for="enq-name">Your name</label>
                  <input class="input" id="enq-name" name="name" data-label="Name" type="text" autocomplete="name" required>
                </div>
                <div class="field">
                  <label class="field-label" for="enq-company">Company</label>
                  <input class="input" id="enq-company" name="company" data-label="Company" type="text" autocomplete="organization" required>
                </div>
              </div>

              <div class="enq-pair">
                <div class="field">
                  <label class="field-label" for="enq-email">Work email</label>
                  <input class="input" id="enq-email" name="email" data-label="Work email" type="email" autocomplete="email" inputmode="email" dir="ltr" required>
                </div>
                <div class="field">
                  <label class="field-label" for="enq-phone">Phone <span style="opacity:.6">(optional)</span></label>
                  <input class="input" id="enq-phone" name="phone" data-label="Phone" type="tel" autocomplete="tel" dir="ltr">
                </div>
              </div>

              <div class="field">
                <label class="field-label" for="enq-volume">Monthly shipment volume</label>
                <select class="input" id="enq-volume" name="volume" data-label="Monthly volume">${options}</select>
              </div>

              <div class="field">
                <label class="field-label" for="enq-message">What are you trying to fix?</label>
                <textarea class="input" id="enq-message" name="message" data-label="What they want to fix" rows="4" placeholder="For example: quotes live in email, customs is a separate system, and customers chase us for ETAs."></textarea>
              </div>

              <p class="form-status" data-form-status hidden tabindex="-1"></p>

              <button class="btn btn-solid btn-lg" type="submit" style="inline-size:100%">
                Send enquiry ${arrow(16)}
              </button>

              <p class="field-hint">
                We use your details to answer your enquiry. Prefer email?
                <a href="mailto:${site.enquiryEmail}" style="color:var(--lift);text-decoration:underline">${site.enquiryEmail}</a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </section>`;
}

/* ------------------------------------------------------------- next step -- */

export function nextStep({ title, lede, primary = { label: "Enquire", href: "/contact#enquire" }, secondary }) {
  return `<section class="band band-y-sm">
      <div class="shell">
        <hr class="rule rv">
        <div class="sec-split" style="align-items:center;padding-block-start:clamp(32px,4vw,56px)">
          <div class="stack gap-4 rv">
            <h2 class="d3">${title}</h2>
            ${lede ? `<p class="body">${lede}</p>` : ""}
          </div>
          <div class="inline rv" style="gap:12px;justify-content:flex-end">
            <a class="btn btn-solid btn-lg" href="${primary.href}">${primary.label} ${arrow(16)}</a>
            ${secondary ? `<a class="btn btn-line btn-lg" href="${secondary.href}">${secondary.label}</a>` : ""}
          </div>
        </div>
      </div>
    </section>`;
}

/* --------------------------------------------------- how it connects (line) */

export function connectsSection({ current, index = "05", title, lede }) {
  return `<section class="band paper band-y">
      <div class="shell">
        ${secHead({
          index,
          label: "How it connects",
          title,
          lede,
          titleClass: "d3",
        })}
        <div style="margin-block-start:clamp(36px,4vw,60px)">${line({ current })}</div>
      </div>
    </section>`;
}

/* Feature index rows, used on the overview page. Reuses the line's visual
   language so the two pages feel like the same document. */
export function featureIndexRows() {
  return features
    .map(
      (feature, index) => `<a class="line-step rv" style="--d:${index * 40}ms" href="${featureHref(feature.slug)}">
        <span class="line-n">${String(index + 1).padStart(2, "0")}</span>
        <span>
          <span class="line-name">${feature.title}</span>
          <span class="line-owner">${feature.chain} · ${feature.kicker}</span>
        </span>
        <span class="line-desc">${feature.summary}</span>
        <span class="line-go">${arrow(17)}</span>
      </a>`,
    )
    .join("");
}

export { shot, deck, featureIcon };
