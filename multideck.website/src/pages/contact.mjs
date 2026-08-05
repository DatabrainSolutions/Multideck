import { site } from "../../site.config.mjs";
import { arrow, enquirySection, outcomeList, pageHero, secHead } from "../components.mjs";

/* Contact is the enquiry page. It says what to bring, because half an hour with a
   real job in it is worth more than an hour of slides. */

const bring = [
  {
    icon: "receipt",
    title: "One quote you issued last week",
    text: "With the charge lines you actually use. We will rebuild it in Multideck while you watch.",
  },
  {
    icon: "scanText",
    title: "Two or three awkward documents",
    text: "A supplier invoice in an odd layout, a scanned packing list, a photo of a CMR. We will read them live.",
  },
  {
    icon: "alert",
    title: "A job that went wrong",
    text: "A hold, a missed handover, a demurrage charge, and the email you had to send about it. This is the most useful thirty minutes of the session.",
  },
  {
    icon: "spreadsheet",
    title: "Whatever you track jobs in today",
    text: "The spreadsheet, the whiteboard, the shared calendar. We will map it and tell you honestly what stays where it is.",
  },
];

export const contact = {
  route: "/contact",
  title: "Contact",
  description:
    "Enquire about Multideck. Tell us how your freight team runs today and we will show you the product against your own lanes, paperwork, and handoffs.",
  hasEnquiry: true,
  body: () => `
    ${pageHero({
      crumbs: [{ label: "Home", href: "/" }, { label: "Contact" }],
      label: "Contact",
      title: ["Tell us how your desk runs.", "We will show you", "the difference."],
      lede: `Send an enquiry and you will hear back from someone who knows the product and the domain, within ${site.responseWindow}. If you would rather just email, use <a href="mailto:${site.enquiryEmail}" style="color:var(--green);text-decoration:underline">${site.enquiryEmail}</a>.`,
      actions: `<a class="btn btn-solid" href="#enquire">Enquire ${arrow(15)}</a>
        <a class="btn btn-line" href="${site.loginUrl}">Log in</a>`,
      aside: `<p class="pull">No slides. One of your real jobs, on screen, in Multideck.</p>`,
    })}

    <section class="band band-y">
      <div class="shell">
        ${secHead({
          index: "01",
          label: "Before the session",
          title: ["What to bring, if you want", "the half hour to be worth it."],
          lede: "None of this is required. It is simply the difference between watching a demo and finding out whether Multideck fits your operation.",
        })}

        <div style="margin-block-start:clamp(36px,4vw,60px)">${outcomeList(bring)}</div>

        <div class="rv" style="margin-block-start:clamp(44px,5vw,72px)">
          <hr class="rule">
          <div class="sec-split" style="align-items:center;padding-block-start:clamp(28px,3.5vw,48px)">
            <div class="stack gap-3">
              <h2 class="d4">Already using Multideck?</h2>
              <p class="body-sm">Log in to your workspace, or email us and we will get the right person onto it.</p>
            </div>
            <div class="inline" style="gap:12px;justify-content:flex-end">
              <a class="btn btn-line" href="${site.loginUrl}">Log in to Multideck</a>
              <a class="btn btn-quiet" href="mailto:${site.enquiryEmail}">${site.enquiryEmail}</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    ${enquirySection({
      title: "Send an enquiry",
      lede: "A few details so we come to the conversation prepared. We will reply within one working day with a couple of times.",
    })}
  `,
};
