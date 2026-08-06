import { featureBySlug, site } from "../../site.config.mjs";
import { shot } from "../media.mjs";
import {
  arrow,
  connectsSection,
  duo,
  ledger,
  nextStep,
  pageHero,
  pinned,
  results,
  secHead,
  secMark,
  statementBand,
} from "../components.mjs";

/* Every feature page answers the same six questions in the same order — the
   problem, the result, the proof, the connection, the decision point, the next
   step — so a visitor comparing two of them is comparing like with like. The
   proof sections carry each page's own character. */

/**
 * @param {{
 *   slug: string,
 *   label?: string,
 *   title: string[],
 *   lede: string,
 *   description: string,
 *   pull: string,
 *   heroShot: object,
 *   problem: {title: string[], lede: string, aside?: string, items: {term: string, text: string}[]},
 *   results: {value: string, label: string}[],
 *   resultsTitle: string[],
 *   tour: {media: string, blocks: object[], label?: string, end?: string},
 *   duo: object,
 *   midCta: {statement: string, body: string[]},
 *   connects: {title: string, lede: string},
 *   close: {title: string, lede: string},
 * }} config
 */
export function featurePage(config) {
  const feature = featureBySlug[config.slug];

  return {
    route: `/features/${config.slug}`,
    title: feature.title,
    description: config.description,
    body: () => `
      ${pageHero({
        crumbs: [
          { label: "Home", href: "/" },
          { label: "Features", href: "/features" },
          { label: feature.title },
        ],
        label: `${feature.chain} · ${config.label || feature.kicker}`,
        title: config.title,
        lede: config.lede,
        actions: `<a class="btn btn-solid" href="/contact#enquire">Enquire ${arrow(15)}</a>
          <a class="btn btn-line" href="${site.loginUrl}">Log in</a>`,
        aside: `<p class="pull">${config.pull}</p>`,
      })}

      <div class="bleed" style="padding-block-end:clamp(48px,6vw,88px)">
        <div class="rv">${shot({ ...config.heroShot, ratio: config.heroShot.ratio || "21 / 9" })}</div>
      </div>

      <section class="band paper band-y">
        <div class="shell">
          ${secHead({
            index: "01",
            label: "The problem it solves",
            title: config.problem.title,
            lede: config.problem.lede,
            aside: config.problem.aside,
          })}
          <div style="margin-block-start:clamp(44px,5vw,76px)">${ledger(config.problem.items)}</div>
        </div>
      </section>

      <section class="band band-y">
        <div class="shell">
          ${secHead({
            index: "02",
            label: "What you can expect",
            title: config.resultsTitle,
            titleClass: "d3",
          })}
          <div style="margin-block-start:clamp(36px,4vw,60px)">${results(config.results)}</div>
        </div>
      </section>

      <section class="band paper band-y">
        <div class="shell">
          ${secMark({
            index: "03",
            label: config.tour.label || "How it works",
            end: config.tour.end || feature.title,
          })}
          ${pinned(config.tour)}
        </div>
      </section>

      <section class="band band-y">
        <div class="shell">
          ${secMark({ index: "04", label: config.duo.label || "In detail" })}
          ${duo({ ...config.duo, label: null })}
        </div>
      </section>

      ${statementBand({
        label: "Next step",
        statement: config.midCta.statement,
        body: config.midCta.body,
        link: { href: "/contact#enquire", label: "Enquire about Multideck" },
      })}

      ${connectsSection({
        current: config.slug,
        index: "06",
        title: config.connects.title,
        lede: config.connects.lede,
      })}

      ${nextStep({
        title: config.close.title,
        lede: config.close.lede,
        primary: { label: "Enquire", href: "/contact#enquire" },
        secondary: { label: "Log in", href: site.loginUrl },
      })}
    `,
  };
}
