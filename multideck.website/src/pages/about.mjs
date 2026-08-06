import { site } from "../../site.config.mjs";
import { icon } from "../icons.mjs";
import { shot } from "../media.mjs";
import {
  arrow,
  ledger,
  line,
  nextStep,
  outcomeList,
  pageHero,
  secHead,
  statementBand,
} from "../components.mjs";

/* The About page argues for a way of building rather than a company history —
   which is what a forwarding owner is actually assessing when they read it. */

const principles = [
  {
    icon: "users",
    title: "The operator decides",
    text: "Multideck prepares work; a person approves it. Nothing is sent to a customer, filed with an authority, or written to a declaration without someone whose name is on it saying so. That is not caution. It is what makes the assistance usable on a real desk.",
  },
  {
    icon: "gauge",
    title: "Density is respect",
    text: "Operators scan; they do not read. The product runs at 11 to 13 pixel metadata, 21 pixel status pills, and compact rows on purpose, so a whole desk fits on one screen. Marketing pages get to breathe. Working screens get to be efficient.",
  },
  {
    icon: "layers",
    title: "One record, many views",
    text: "A booking is not copied into customs, tracking, or accounts. Each of those is a view of the same record. It is a harder way to build and the only way to stop two systems disagreeing about a weight.",
  },
  {
    icon: "link",
    title: "Sources beat confidence",
    text: "Every extracted value keeps a pointer to the page it was read from, and every answer cites the record behind it. If we cannot show you where something came from, we would rather not assert it.",
  },
  {
    icon: "globe",
    title: "Language and direction are product requirements",
    text: "Multideck is translated, and it flips properly for right-to-left languages, including navigation, tables, forms, and controls. Freight is an international business, and a desk in Dubai should not be running a mirror image of a London one.",
  },
];

const working = [
  {
    term: "We start with one real job",
    text: "Not a sandbox. You walk us through a shipment you actually ran, including the part that went wrong, and we show you where Multideck would have held it.",
  },
  {
    term: "We set up your references",
    text: "Your ports, your lanes, your document types, your charge lines, your job reference format. A workspace that looks like your business is the only fair test.",
  },
  {
    term: "We move one workflow at a time",
    text: "Most teams start where the pain is loudest, usually paperwork or customs exceptions, and add the next step once the first is genuinely faster.",
  },
  {
    term: "We stay reachable afterwards",
    text: "You get people who know the product and the domain, not a ticket queue that answers in three days with a link to a help article.",
  },
];

export const about = {
  route: "/about",
  title: "About",
  description:
    "Multideck is built for the freight desk rather than the demo: one shipment record, operator approval on every action, and every value traceable to its source.",
  body: () => `
    ${pageHero({
      crumbs: [{ label: "Home", href: "/" }, { label: "About" }],
      label: "About Multideck",
      title: ["We build for the desk,", "not for the demo."],
      lede: "Multideck exists because forwarding runs on people holding context together in their heads, and that is an expensive, fragile way to run a business.",
      actions: `<a class="btn btn-solid" href="/contact#enquire">Enquire ${arrow(15)}</a>
        <a class="btn btn-line" href="/features">See the features</a>`,
      aside: `<p class="pull">Forwarding software should remove admin, not relocate it.</p>`,
    })}

    <section class="band band-y">
      <div class="shell">
        ${secHead({
          index: "01",
          label: "Why we built it",
          title: ["Every forwarder we spoke to", "was running the same job", "in four places,", "and apologising for it."],
          aside: `<p class="body">Not because anyone chose that. A shared inbox was free, the spreadsheet already existed, the carrier had a portal, and the customs software was bought for a specific regime. Each decision was reasonable.</p>
            <p class="body">The result is a desk where the most experienced person is the one who remembers where things are, and that shows up commercially long before it shows up as a mistake.</p>`,
        })}

        <div class="rv" style="margin-block-start:clamp(44px,5vw,76px)">
          ${shot({
            label: "One booking, and everything downstream that reads from it",
            note: "A booking record beside the quote, declaration, arrival notice, and invoice that draw their values from it.",
            ratio: "21 / 9",
            caption: "The whole argument for a single workspace, on one screen",
            captionMeta: "One record",
          })}
        </div>
      </div>
    </section>

    <section class="band paper band-y">
      <div class="shell">
        ${secHead({
          index: "02",
          label: "How we build",
          title: ["Five commitments", "we hold ourselves to."],
          lede: "These shape every screen in the product, and they are the ones worth arguing with us about.",
        })}
        <div style="margin-block-start:clamp(36px,4vw,60px)">${outcomeList(principles)}</div>
      </div>
    </section>

    <section class="band band-y">
      <div class="shell">
        ${secHead({
          index: "03",
          label: "The product",
          title: ["One job.", "Six steps.", "One record."],
          aside: `<p class="body">Each step is a full capability in its own right. What makes them worth having together is that none of them re-creates the others' data.</p>`,
        })}
        <div style="margin-block-start:clamp(40px,5vw,72px)">${line()}</div>
      </div>
    </section>

    ${statementBand({
      label: "04 · Working with us",
      statement: "Freight teams cannot stop for a transformation programme.",
      body: [
        "So we do not ask them to. We start with one real job, set the workspace up with your own references, and move one workflow at a time, usually starting wherever the pain is loudest.",
        "If a workflow should stay where it is, we will tell you. Not everything belongs in a system, and a product that claims otherwise is selling something else.",
      ],
      link: { href: "/contact#enquire", label: "Start with one real job" },
    })}

    <section class="band band-y">
      <div class="shell">
        ${secHead({
          index: "05",
          label: "What it looks like",
          title: ["Bringing Multideck", "onto a live desk."],
          titleClass: "d3",
        })}
        <div style="margin-block-start:clamp(36px,4vw,60px)">${ledger(working)}</div>
      </div>
    </section>

    ${nextStep({
      title: "Come and disagree with us.",
      lede: "If you run a forwarding desk and think we have got something wrong about how it works, we would genuinely like to hear it.",
      primary: { label: "Enquire", href: "/contact#enquire" },
      secondary: { label: "Log in", href: site.loginUrl },
    })}
  `,
};
