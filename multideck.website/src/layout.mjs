import { features, site } from "../site.config.mjs";
import { icon, logoMark } from "./icons.mjs";
import { deck } from "./media.mjs";

/* Which icon stands for each feature, in the dropdown, the footer, and the index.
   Declared once so those surfaces cannot drift apart. */
export const featureIcon = {
  "sales-crm": "users",
  bookings: "box",
  "document-extraction": "scanText",
  customs: "shield",
  "live-tracking": "radar",
  dexter: "sparkles",
};

/* Temporary website art supplied by the product team. The same four images are
   intentionally reused across the six destinations until feature-specific
   captures replace them. Keeping the mapping here makes that swap mechanical. */
const featureMenuMedia = {
  "sales-crm": { src: "/assets/menu/deals.webp", position: "50% 42%" },
  bookings: { src: "/assets/menu/inbox.webp", position: "38% 38%" },
  "document-extraction": { src: "/assets/shots/document-extraction.png", position: "50% 42%" },
  customs: { src: "/assets/menu/customs.png", position: "50% 42%" },
  "live-tracking": { src: "/assets/menu/deals.webp", position: "72% 42%" },
  quotes: { src: "/assets/menu/quotes.png", position: "50% 42%" },
  warehouse: { src: "/assets/menu/warehouse.png", position: "50% 42%" },
  dexter: {
    src: "/assets/menu/dexter-long.png",
    position: "50% 50%",
    width: 1837,
    height: 974,
  },
};

/* These areas belong in the product story now, but do not yet have dedicated
   marketing pages. They deliberately return visitors to the existing feature
   overview until their own pages and screenshots are ready. */
const supplementaryMenuFeatures = [
  { slug: "inbox", title: "Inbox", href: "/features", mediaKey: "bookings", icon: "mail" },
  { slug: "quoting", title: "Quoting", href: "/features", mediaKey: "quotes", icon: "receipt" },
  { slug: "warehouse", title: "Warehouse", href: "/features", mediaKey: "warehouse", icon: "building" },
  { slug: "finance", title: "Finance", href: "/features", mediaKey: "document-extraction", icon: "receipt" },
  { slug: "operations", title: "Operations", href: "/features", mediaKey: "bookings", icon: "workflow" },
];

export const featureHref = (slug) => `/features/${slug}`;

const escapeAttr = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/* -------------------------------------------------------------------- header */

function headerMarkup({ route, enquireHref }) {
  const current = (href) => (route === href ? ' aria-current="page"' : "");
  const dexterFeature = features.find((feature) => feature.slug === "dexter");
  const menuFeatures = [
    ...(dexterFeature
      ? [{ ...dexterFeature, href: featureHref("dexter"), mediaKey: "dexter", icon: featureIcon.dexter, wide: true }]
      : []),
    ...features
      .filter((feature) => feature.slug !== "dexter")
      .map((feature) => ({ ...feature, href: featureHref(feature.slug), mediaKey: feature.slug, icon: featureIcon[feature.slug] })),
    ...supplementaryMenuFeatures,
  ];

  /* Dexter leads with a two-column visual; the remaining cards complete two
     balanced six-column rows without adding another navigation tier. */
  const menuCards = menuFeatures
    .map(
      (feature, index) => {
        const media = featureMenuMedia[feature.mediaKey];

        return `
          <a
            class="menu-card${feature.wide ? " menu-card--wide" : ""}"
            href="${feature.href}"
            style="--menu-i:${index};--menu-object-position:${media.position}"
          >
            <span class="menu-art" aria-hidden="true">
              <img
                src="${media.src}"
                alt=""
                width="${media.width || 974}"
                height="${media.height || 974}"
                decoding="async"
                fetchpriority="low"
              >
              <span class="menu-art-fade"></span>
            </span>
            <span class="menu-card-copy">
              <span class="menu-title">${feature.title}</span>
            </span>
          </a>`;
      },
    )
    .join("");

  const mobileCards = menuFeatures
    .map(
      (feature) => `
            <a class="mnav-card" href="${feature.href}">
              <span class="menu-icon">${icon(feature.icon, { size: 16 })}</span>
              <span class="menu-title">${feature.title}</span>
            </a>`,
    )
    .join("");

  return `<header class="header" data-header>
      <div class="shell header-inner">
        <a class="brand" href="/" aria-label="Multideck home">
          ${logoMark({ size: 24 })}
          <span class="brand-name">Multideck</span>
        </a>

        <nav class="nav" aria-label="Main">
          <div class="menu-wrap" data-menu-wrap>
            <button
              class="nav-trigger"
              type="button"
              data-menu-trigger
              aria-expanded="false"
              aria-controls="features-menu"
            >Features ${icon("chevronDown", { size: 14 })}</button>

            <div
              class="menu"
              id="features-menu"
              data-menu
              data-open="false"
              aria-hidden="true"
              inert
            >
              <div class="menu-reveal">
                <div class="shell menu-inner">
                  <div class="menu-grid">${menuCards}</div>
                  <div class="menu-foot">
                    <span class="meta">One workspace. One shipment record.</span>
                    <a class="go" href="/features">Explore all features ${icon("arrowRight", {
                      size: 15,
                      className: "glyph",
                    })}</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <a class="nav-link" href="/pricing"${current("/pricing")}>Pricing</a>
          <a class="nav-link" href="/about"${current("/about")}>About</a>
          <a class="nav-link" href="/contact"${current("/contact")}>Contact</a>
        </nav>

        <div class="header-actions">
          <a class="btn btn-quiet" href="${site.loginUrl}">Log in</a>
          <a class="btn btn-solid" href="${enquireHref}">Enquire</a>
        </div>

        <button
          class="nav-toggle"
          type="button"
          data-nav-toggle
          aria-expanded="false"
          aria-controls="mobile-nav"
          aria-label="Open menu"
        >${icon("menu", { size: 20, className: "i-menu" })}${icon("close", {
          size: 20,
          className: "i-close",
        })}</button>
      </div>

      <div
        class="mnav"
        id="mobile-nav"
        data-mobile-nav
        data-open="false"
        aria-hidden="true"
        inert
      >
        <div class="shell mnav-inner">
          <p class="mnav-label">Features</p>
          <div class="mnav-grid">${mobileCards}</div>
          <p class="mnav-label">Company</p>
          <a class="mnav-link" href="/features"><span>Features overview</span>${icon("chevronRight", {
            size: 16,
            className: "glyph",
          })}</a>
          <a class="mnav-link" href="/pricing"><span>Pricing</span>${icon("chevronRight", {
            size: 16,
            className: "glyph",
          })}</a>
          <a class="mnav-link" href="/about"><span>About</span>${icon("chevronRight", {
            size: 16,
            className: "glyph",
          })}</a>
          <a class="mnav-link" href="/contact"><span>Contact</span>${icon("chevronRight", {
            size: 16,
            className: "glyph",
          })}</a>
          <div class="mnav-actions">
            <a class="btn btn-solid btn-lg" href="${enquireHref}">Enquire</a>
            <a class="btn btn-line btn-lg" href="${site.loginUrl}">Log in</a>
          </div>
        </div>
      </div>
    </header>`;
}

/* -------------------------------------------------------------------- footer */

function footerMarkup() {
  const productLinks = features
    .map((feature) => `<li><a class="footer-link" href="${featureHref(feature.slug)}">${feature.title}</a></li>`)
    .join("");

  return `<footer class="footer">
      <div class="shell">
        <div class="footer-grid">
          <div>
            <a class="brand" href="/" style="color:#fff;margin-inline-start:-8px" aria-label="Multideck home">
              ${deck()}
              <span class="brand-name">Multideck</span>
            </a>
            <p class="body-sm" style="margin-block-start:16px;max-width:32ch;color:rgba(255,255,255,.62)">
              One operational workspace for freight-forwarding teams. Sales, bookings, paperwork,
              customs, tracking, and Dexter working from the same shipment record.
            </p>
            <p style="margin-block-start:22px">
              <a class="go" href="/contact#enquire">Enquire about Multideck ${icon("arrowRight", {
                size: 15,
                className: "glyph",
              })}</a>
            </p>
          </div>

          <nav aria-label="Product">
            <p class="footer-label">Product</p>
            <ul>
              ${productLinks}
              <li><a class="footer-link" href="/features">Features overview</a></li>
              <li><a class="footer-link" href="/pricing">Pricing</a></li>
            </ul>
          </nav>

          <nav aria-label="Company">
            <p class="footer-label">Company</p>
            <ul>
              <li><a class="footer-link" href="/about">About Multideck</a></li>
              <li><a class="footer-link" href="/contact">Contact the team</a></li>
              <li><a class="footer-link" href="/contact#enquire">Enquire</a></li>
            </ul>
          </nav>

          <nav aria-label="Account">
            <p class="footer-label">Account</p>
            <ul>
              <li><a class="footer-link" href="${site.loginUrl}">Log in to Multideck</a></li>
              <li><a class="footer-link" href="mailto:${site.enquiryEmail}">${site.enquiryEmail}</a></li>
            </ul>
          </nav>
        </div>

        <p class="footer-word" aria-hidden="true">Multideck</p>

        <div class="footer-base">
          <p>© ${new Date().getUTCFullYear()} Multideck. Freight operations software.</p>
          <p>Ocean · Air · Road · Groupage · Customs · Warehousing</p>
        </div>
      </div>
    </footer>`;
}

/* ------------------------------------------------------------------ document */

/**
 * @param {{
 *   route: string,
 *   title: string,
 *   description: string,
 *   head?: string,
 *   hasEnquiry?: boolean,
 *   body: (context: {enquireHref: string}) => string,
 * }} page
 */
export function renderDocument(page) {
  const enquireHref = page.hasEnquiry ? "#enquire" : "/contact#enquire";
  const canonical = `${site.origin}${page.route === "/" ? "/" : `${page.route}/`}`;
  const fullTitle = page.route === "/" ? `${site.name}: ${site.tagline}` : `${page.title} | ${site.name}`;
  const pageHead = page.head ?? "";
  const returningOperatorRedirect = page.route === "/" && site.authStorageKey
    ? `<script>
try {
  var storedSession = JSON.parse(localStorage.getItem(${JSON.stringify(site.authStorageKey)}) || "null");
  var session = storedSession && (storedSession.currentSession || storedSession);
  if (session && session.access_token && session.refresh_token) {
    window.location.replace(${JSON.stringify(site.appUrl)});
  }
} catch (error) {
  // A missing, unavailable, or malformed local session means the website stays visible.
}
</script>`
    : "";

  return `<!doctype html>
<html lang="en" dir="ltr" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(fullTitle)}</title>
<meta name="description" content="${escapeAttr(page.description)}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Multideck">
<meta property="og:title" content="${escapeAttr(fullTitle)}">
<meta property="og:description" content="${escapeAttr(page.description)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
${pageHead}
<link rel="stylesheet" href="/assets/styles.css">
${returningOperatorRedirect}
<script>document.documentElement.className=""</script>
</head>
<body data-route="${escapeAttr(page.route)}">
<a class="skip-link" href="#main">Skip to content</a>
${headerMarkup({ route: page.route, enquireHref })}
<main id="main">
${page.body({ enquireHref })}
</main>
${footerMarkup()}
<script src="/assets/site.js" defer></script>
</body>
</html>
`;
}
