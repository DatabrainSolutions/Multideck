# Multideck website

The marketing site. Nine pages, built as static HTML by a zero-dependency Node
script — no framework, no bundler, no `npm install`.

```bash
npm run dev                    # unified website + auth + app on http://localhost:3000
npm run dev -- --port 4321     # same unified product on another local port
npm run dev:website-only       # static website only on http://localhost:4321
npm run build                  # writes dist/
```

Use the unified `dev` command for normal local testing. The homepage, marketing
pages, `/auth`, `/app`, and operational routes are served from the same origin,
so links and authentication callbacks continue to work on whichever port was
chosen. The website-only command is reserved for isolated static-site checks.

Or from the repo root, use the `multideck-website` entry in `.claude/launch.json`.

## What ships

| | gzipped |
|---|---|
| Home page HTML | ~9 kB |
| CSS (one file, all pages) | ~10 kB |
| JS (one file, deferred) | ~2 kB |
| Geist Variable (one file, all weights) | 29 kB |

No images, no icon font, no third-party requests. Icons are inline SVG, the
product mark is inline SVG, and every media slot reserves its space with
`aspect-ratio` so nothing shifts as the page loads.

## Adding screenshots

Every product visual is a slot rendered by `shot()` in `src/media.mjs`. With no
`src`, it renders a labelled placeholder stating which screen it wants and what
should be on it. With a `src`, it renders an `<img>` at the same locked aspect
ratio, so the layout does not move.

1. Take the screenshot the placeholder describes.
2. Save it to `public/assets/shots/` — PNG or WebP, 2× the slot's rendered width
   is plenty (roughly 2400 px wide for the full-bleed 21:9 slots).
3. Add `src` and `alt` to that slot's call:

```js
shot({
  src: "/assets/shots/bookings-register.png",
  alt: "Multideck bookings register showing 41 live jobs with exceptions at the top",
  label: "The bookings register",          // keep — used if src is ever removed
  note: "Forty-one live jobs with …",      // keep — describes the intended shot
  ratio: "21 / 9",
  caption: "Forty-one live jobs, and the three that need you today",
  captionMeta: "Bookings",
})
```

Screenshots are cropped from the top (`object-position: top center`), so lead
with the part that matters and do not worry about matching the ratio exactly.

There are 26 slots. `grep -rn "shot({" src/` lists them all.

## Configuration

`site.config.mjs` holds everything environment-specific:

- `loginUrl` — **Log in** points to the existing app-owned `/auth` route.
- `appUrl` — returning operators with a local tenant session are sent to `/app`,
  where the app validates or refreshes it before showing workspace data.
- `enquiryEndpoint` — set this to a POST endpoint and the enquiry form submits
  straight to it. While it is `null`, the form still validates and hands the
  completed enquiry to the visitor's own mail client addressed to
  `enquiryEmail`, so nothing is silently dropped.
- `enquiryEmail`, `origin`, `responseWindow`.
- `features` — the six feature pages. This one list drives the header dropdown,
  the footer, the features index, and the six-step line, so adding a feature page
  means adding it here plus a `featurePage({ … })` block and an icon mapping.

`MULTIDECK_WEBSITE_ORIGIN` can override the current `https://dev.multideck.app`
canonical origin when the production hostname changes.

## Structure

```
build.mjs            renders every page to dist/, copies public/
dev.mjs              dev server: builds in a child process, watches, serves clean URLs
site.config.mjs      environment values + the feature list
src/
  layout.mjs         document shell, header (features grid dropdown), footer
  components.mjs     section furniture: marks, headings, the six-step line,
                     pinned sequences, ledgers, enquiry, next-step
  media.mjs          shot() slots, the deck motif, the lane ticker
  icons.mjs          inline icon set
  pages/             one module per page; feature-page.mjs is the shared shape
public/
  assets/styles.css  the whole design system, documented at the top
  assets/site.js     menu, mobile nav, scroll reveals, form
  assets/fonts/      Geist Variable (copied from the client's dependency)
  assets/shots/      screenshots go here
```

## Design notes

Tokens, elevation recipe, radii, and the motion curve are taken from
`multideck.client/src/styles.css`, so the site and the product read as one system.
Two deliberate differences: the site's surfaces are warm off-white rather than the
app's cool grey shell, and there is an editorial display scale on top of the app's
11–14 px UI scale.

The logo's three offset decks are the only decorative device on the site. They
appear as section markers, as the corner detail on every media frame, and in the
header and footer. Nothing else abstract is invented.

Copy rules: sentence case, verb-led buttons, links that name their destination,
and no category jargon. The product's differentiator is stated as capability —
what it reads, watches, and prepares — never as a technology label.

## Accessibility and i18n

- Semantic landmarks, a skip link, visible focus rings, and a keyboard-operable
  dropdown (Escape closes, focus-out closes, `aria-expanded` tracked).
- Every reveal is progressive enhancement: `html.no-js` shows all content, and
  `prefers-reduced-motion` holds each composition at its final state and stops the
  lane ticker.
- Layout uses logical properties throughout, so `dir="rtl"` flips the whole site.
  Arrow glyphs mirror; reference codes and keycaps stay left-to-right.

## Deploying

The repo's root `build-deployment.mjs` combines the static website and tenant app
into one Vercel output: the website owns `/`, while `/app`, `/auth`, and the
operational routes resolve to the app shell.
