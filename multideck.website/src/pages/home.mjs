import { site } from "../../site.config.mjs";
import { arrow, enquirySection, lines } from "../components.mjs";
import { icon } from "../icons.mjs";

const screenshots = {
  deals: "/assets/menu/deals.webp",
  dexter: "/assets/menu/dexter.webp",
  inbox: "/assets/menu/inbox.webp",
  lead: "/assets/menu/lead-details.png",
  quotes: "/assets/menu/quotes.png",
  documentExtraction: "/assets/shots/document-extraction.png",
};

function productImage({ src, alt, className = "", priority = false }) {
  return `<img
      class="home-product-image ${className}"
      src="${src}"
      alt="${alt}"
      width="974"
      height="974"
      ${priority ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}
      decoding="async"
    >`;
}

function dexterHeroDemo() {
  return `<div class="hero-dexter-wrap">
      <div data-dexter-marketing-root>
        <div class="hero-dexter" aria-hidden="true">
          <span class="hero-dexter-bloom"></span>
          <div class="hero-dexter-role">
            <span class="hero-dexter-role-pill">${icon("sparkles", { size: 15 })} Dexter <span aria-hidden="true">⌄</span></span>
          </div>
          <div class="hero-dexter-panel">
            <p class="hero-dexter-prompt">Build my morning brief: overnight changes, blocked jobs, customer promises, and what I should do first.<span class="hero-dexter-caret"></span></p>
            <div class="hero-dexter-controls">
              <span class="hero-dexter-icon">+</span>
              <span class="hero-dexter-chip"><span class="hero-dexter-provider"></span> Fast <span aria-hidden="true">⌄</span></span>
              <span class="hero-dexter-chip">18,400 / 128,000</span>
              <span class="hero-dexter-chip">Full access <span aria-hidden="true">⌄</span></span>
              <span class="hero-dexter-send">${icon("send", { size: 17 })}</span>
            </div>
          </div>
        </div>
      </div>
      <noscript><p class="body-sm">Ask Dexter about live bookings, customer updates, documents, and exceptions.</p></noscript>
      <script type="module" src="/assets/marketing-dexter.js"></script>
    </div>`;
}

function hero({ enquireHref }) {
  return `<section class="hero" data-hero-parallax>
      <div class="shell">
        <div class="hero-top">
          ${lines(
            ["One workspace that", `<span class="in-green">reads ahead</span> of the job.`],
            { className: "d1", tag: "h1" },
          )}

          <p class="hero-sub rv" style="--d:140ms">
            It reads your documents, watches your freight, and drafts what comes next.
          </p>

          ${dexterHeroDemo()}

          <div class="hero-actions rv" style="--d:200ms">
            <a class="btn btn-solid btn-lg" href="${enquireHref}">Enquire ${arrow(16)}</a>
            <a class="btn btn-line btn-lg" href="${site.loginUrl}">Log in</a>
          </div>
        </div>
      </div>

    </section>`;
}

function connectedStory() {
  return `<section class="home-story band-y">
      <div class="shell">
        <div class="home-section-head">
          <div class="home-section-heading">
            <p class="home-section-label rv">Why Multideck</p>
            ${lines(["The job moves once.", "Your information should too."], {
              className: "home-section-title",
            })}
            <p class="home-section-lede rv" style="--d:100ms">
              Freight forwarding is already complex. The software should not make your team rebuild the same story at every handoff.
            </p>
          </div>
        </div>

        <div class="home-mosaic">
          <article class="home-mosaic-card home-mosaic-copy rv" style="--d:0ms">
            <span class="home-mosaic-icon">${icon("workflow", { size: 22 })}</span>
            <div>
              <h3>One record from enquiry to invoice</h3>
              <p>Commercial context, operational detail, paperwork, and movement stay attached to the same job.</p>
            </div>
            <a class="go" href="/features">See the connected workflow ${arrow()}</a>
          </article>

          <figure class="home-mosaic-card home-mosaic-main rv" style="--d:80ms">
            ${productImage({
              src: screenshots.deals,
              alt: "Freight opportunities organised in the Multideck deals pipeline",
            })}
            <figcaption>Win the work with the lane, value, owner, and next step already visible.</figcaption>
          </figure>

          <figure class="home-mosaic-card home-mosaic-side rv" style="--d:160ms">
            ${productImage({
              src: screenshots.lead,
              alt: "Customer and company details connected to a live freight opportunity",
            })}
            <figcaption>Keep the customer context beside the job, not buried in another system.</figcaption>
          </figure>
        </div>

        <div class="home-shift" aria-label="Operational improvements">
          ${[
            ["Less retyping", "The same facts move forward"],
            ["Clear ownership", "Every job and exception has a person"],
            ["Earlier answers", "The current story is already assembled"],
            ["Safer handoffs", "Context travels with the work"],
          ]
            .map(
              ([title, text], index) => `<div class="home-shift-item rv" style="--d:${index * 45}ms">
                  <strong>${title}</strong>
                  <span>${text}</span>
                </div>`,
            )
            .join("")}
        </div>
      </div>
    </section>`;
}

const flows = [
  {
    label: "Sales and bookings",
    title: "Win the work, then carry the context forward.",
    body: "The accepted quote becomes the operational job. Parties, charges, equipment, references, and the promises already made stay with it, without another round of data entry.",
    image: screenshots.quotes,
    alt: "A live freight quote reviewed in Multideck before it becomes an operational booking",
    inset: screenshots.lead,
    insetAlt: "Customer details connected to a freight opportunity",
    points: ["Pipeline, value, owner, and next action in view", "Quote detail carries into the booking", "Commercial context stays visible to operations"],
    links: [
      ["Explore Sales & CRM", "/features/sales-crm"],
      ["Explore bookings", "/features/bookings"],
    ],
  },
  {
    label: "Inbox and paperwork",
    title: "Turn incoming information into organised work.",
    body: "Emails and documents arrive where the team already works. Multideck connects them to the right record, reads the useful values, and shows where the paperwork disagrees before it becomes a delay.",
    image: screenshots.documentExtraction,
    alt: "A freight invoice with values extracted for review in Multideck",
    points: ["Shared communication stays visible to the team", "Documents attach to the right job", "Values are reviewed before they update the record"],
    links: [["Explore AutoDoc", "/features/document-extraction"]],
  },
  {
    label: "Tracking and Dexter",
    title: "Know what changed. Prepare what comes next.",
    body: "Dexter works from the live shipment, its documents, and the latest movement. It explains the exception, links back to the source, and prepares the chase or customer update for the operator to approve.",
    image: screenshots.dexter,
    alt: "Dexter helping an operator from live Multideck freight data",
    points: ["Answers are grounded in the current job", "Sources remain visible for review", "Important actions wait for approval"],
    links: [
      ["Explore Dexter", "/features/dexter"],
      ["Explore live tracking", "/features/live-tracking"],
    ],
  },
];

function flowMedia(flow) {
  return `<div class="home-flow-frame">
      ${productImage({ src: flow.image, alt: flow.alt })}
      ${
        flow.inset
          ? `<div class="home-flow-inset">${productImage({
              src: flow.inset,
              alt: flow.insetAlt,
            })}</div>`
          : ""
      }
    </div>`;
}

function workflowSection() {
  return `<section class="home-workflow band-y">
      <div class="shell">
        <div class="home-workflow-intro">
          <p class="home-section-label rv">One operating flow</p>
          ${lines(["From first enquiry to customer update,", "without rebuilding the job."], {
            className: "home-section-title",
          })}
        </div>

        <div class="home-flow-list">
          ${flows
            .map(
              (flow, index) => `<article class="home-flow-row" data-flip="${index % 2 === 1}">
                  <div class="home-flow-copy rv">
                    <h3>${flow.title}</h3>
                    <p>${flow.body}</p>
                    <ul>
                      ${flow.points
                        .map(
                          (point) => `<li><span>${icon("checkSmall", { size: 15, stroke: 2 })}</span>${point}</li>`,
                        )
                        .join("")}
                    </ul>
                    <div class="home-flow-links">
                      ${flow.links
                        .map(([label, href]) => `<a class="go" href="${href}">${label} ${arrow()}</a>`)
                        .join("")}
                    </div>
                  </div>
                  <div class="home-flow-media rv" style="--d:100ms">${flowMedia(flow)}</div>
                </article>`,
            )
            .join("")}
        </div>
      </div>
    </section>`;
}

function outcomeSection() {
  const outcomes = [
    {
      icon: "layers",
      title: "Less admin",
      text: "Information entered or read once keeps doing useful work throughout the job.",
    },
    {
      icon: "alert",
      title: "Earlier exceptions",
      text: "Delays, missing paperwork, and conflicting details surface while there is still time to act.",
    },
    {
      icon: "send",
      title: "Better customer answers",
      text: "The current story is ready to review, explain, and send without rebuilding it from four screens.",
    },
  ];

  return `<section class="home-outcomes dark band-y">
      <div class="shell">
        <div class="home-outcome-head">
          <p class="home-section-label rv">What changes</p>
          ${lines(["Less admin. Earlier exceptions.", "Better customer answers."], {
            className: "home-section-title",
          })}
          <p class="home-outcome-lede rv" style="--d:100ms">
            Multideck gives the freight desk one calm place to understand the work, decide what matters, and move the job forward.
          </p>
        </div>

        <div class="home-outcome-grid">
          ${outcomes
            .map(
              (outcome, index) => `<article class="home-outcome rv" style="--d:${index * 70}ms">
                  <span>${icon(outcome.icon, { size: 22 })}</span>
                  <h3>${outcome.title}</h3>
                  <p>${outcome.text}</p>
                </article>`,
            )
            .join("")}
        </div>
      </div>
    </section>`;
}

export const home = {
  route: "/",
  title: "Multideck",
  description:
    "Multideck connects sales, bookings, documents, customs, live tracking, and customer updates in one freight-forwarding workspace.",
  head: `<link rel="modulepreload" href="/assets/marketing-dexter.js">
<link rel="preload" href="/assets/multideck-app.css" as="style">`,
  hasEnquiry: true,
  body: ({ enquireHref }) => `
    ${hero({ enquireHref })}
    ${connectedStory()}
    ${workflowSection()}
    ${outcomeSection()}
    ${enquirySection({
      title: "See Multideck against one real freight job",
      lede:
        "Bring one lane, one set of paperwork, and the handoffs that slow your team down. We will show you exactly how the job would run in Multideck.",
      titleClass: "home-enquiry-title",
      sectionClass: "home-enquiry",
      showAudience: false,
      showMark: false,
    })}
  `,
};
