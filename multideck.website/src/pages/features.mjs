import { site } from "../../site.config.mjs";
import { shot, ticker } from "../media.mjs";
import {
  arrow,
  featureIndexRows,
  line,
  nextStep,
  pageHero,
  secHead,
  secMark,
  statementBand,
} from "../components.mjs";

export const featuresOverview = {
  route: "/features",
  title: "Features",
  description:
    "Six capabilities in one freight workspace: sales and CRM, bookings, AutoDoc, customs, live tracking, and Dexter, all reading the same shipment record.",
  body: () => `
    ${pageHero({
      crumbs: [{ label: "Home", href: "/" }, { label: "Features" }],
      label: "Features overview",
      title: ["Six capabilities.", "One shipment record."],
      lede: "Multideck is not a suite of products that integrate. It is one workspace where a shipment is entered once and every capability reads the same record, which is why the admin only happens once.",
      actions: `<a class="btn btn-solid" href="/contact#enquire">Enquire ${arrow(15)}</a>
        <a class="btn btn-line" href="${site.loginUrl}">Log in</a>`,
      aside: `<p class="pull">Entered once at the quote. Reused at the booking, the entry, the update, and the invoice.</p>`,
    })}

    ${ticker()}

    <section class="band band-y">
      <div class="shell">
        ${secMark({ index: "01", label: "The six", end: "Follow any one" })}
        <div class="line">${featureIndexRows()}</div>
      </div>
    </section>

    <section class="band paper band-y">
      <div class="shell">
        ${secHead({
          index: "02",
          label: "How they join up",
          title: ["Each capability owns", "one step of the same job."],
          aside: `<p class="body">Nothing between these steps is a copy. They are all views of one record, which is what stops a value drifting between systems.</p>
            <p class="meta">Follow any step to see the work it does, and what it hands to the step after it.</p>`,
        })}
        <div style="margin-block-start:clamp(40px,5vw,72px)">${line()}</div>
      </div>
    </section>

    ${statementBand({
      label: "03 · The workspace",
      statement: "What an operator actually opens on a Tuesday morning.",
      body: [
        "Work that needs attention, movement in progress, ownership, and the assistance that follows from all three. Calm, dense, and fast to scan, because an operator is reading a screen forty times a day, not once.",
        "The product runs at 11 to 13 pixel metadata and compact rows on purpose. A whole desk fits on one screen, which is the only measure of a working screen that matters.",
      ],
      link: { href: "/contact#enquire", label: "See it against your own lanes" },
      media: shot({
        label: "The Multideck workspace overview",
        note: "The full overview screen: attention queue, live movement, ownership, and Dexter's current suggestion.",
        ratio: "21 / 9",
        caption: "One screen, one desk",
        captionMeta: "Overview",
      }),
    })}

    ${nextStep({
      title: "See it against your own operation.",
      lede: "Tell us how your team runs freight today and which of these six would change the most for you. We will show you that first.",
      primary: { label: "Enquire", href: "/contact#enquire" },
      secondary: { label: "Log in", href: site.loginUrl },
    })}
  `,
};
