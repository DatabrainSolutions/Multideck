/* Single place for the values that change per environment, so no page template
   hardcodes a URL or an address. */
export const site = {
  name: "Multideck",
  tagline: "The operating system for modern freight-forwarding teams",
  origin: process.env.MULTIDECK_WEBSITE_ORIGIN?.replace(/\/$/, "") || "https://dev.multideck.app",

  /* The website and tenant app share an origin. The app owns /auth and /app. */
  loginUrl: "/auth",
  appUrl: "/app",

  /* Supabase persists this tenant's session under a project-specific key. The
     website uses only its presence to hand returning operators to
     the app; the app still validates the session and permissions itself. */
  authStorageKey: (() => {
    try {
      const projectRef = new URL(process.env.VITE_SUPABASE_URL || "").hostname.split(".")[0];
      return projectRef ? `sb-${projectRef}-auth-token` : null;
    } catch {
      return null;
    }
  })(),

  /* Enquiry delivery. Set `enquiryEndpoint` to a POST endpoint that accepts
     form-encoded fields and the form submits straight to it. While it is null
     the form stays fully usable: it validates in the browser and hands the
     completed enquiry to the visitor's own mail client addressed to
     `enquiryEmail`, so no enquiry is silently dropped. */
  enquiryEndpoint: null,
  enquiryEmail: "hello@multideck.io",

  /* Answered honestly in the "what happens next" copy — change both together. */
  responseWindow: "one working day",
};

/* Feature pages. This list drives the header dropdown, the footer, the features
   overview page, and the operational chain, so a new feature page is added once. */
export const features = [
  {
    slug: "sales-crm",
    nav: "Sales & CRM",
    title: "Sales & CRM",
    chain: "Enquiry",
    kicker: "Win the work",
    summary: "Turn freight opportunities into organised, actionable customer work.",
    navSummary: "Enquiries, quotes, and account ownership in one pipeline",
  },
  {
    slug: "bookings",
    nav: "Bookings",
    title: "Bookings",
    chain: "Booking",
    kicker: "Run the job",
    summary: "Move from confirmed work to organised execution without duplicate admin.",
    navSummary: "Confirmed work becomes a job file, not a new data entry task",
  },
  {
    slug: "document-extraction",
    nav: "AutoDoc",
    title: "AutoDoc",
    chain: "Paperwork",
    kicker: "Stop retyping",
    summary: "Read every document once and let the values land where they belong.",
    navSummary: "Invoices, packing lists and BoLs read and matched, not retyped",
  },
  {
    slug: "customs",
    nav: "Customs",
    title: "Customs",
    chain: "Customs",
    kicker: "Stay compliant",
    summary: "Keep declarations, documents, progress, and exceptions visible and controlled.",
    navSummary: "Declarations, documents and exceptions with a visible state",
  },
  {
    slug: "live-tracking",
    nav: "Live Tracking",
    title: "Live Tracking",
    chain: "Movement",
    kicker: "Stay ahead",
    summary:
      "Give teams and customers a reliable view of what is moving, what has changed, and what needs attention.",
    navSummary: "One board for what is moving and what has changed",
  },
  {
    slug: "dexter",
    nav: "Dexter",
    title: "Dexter",
    chain: "Customer visibility",
    kicker: "Work faster",
    summary:
      "Practical help inside the daily workflow, working from your live shipment data.",
    navSummary: "Reads your live records, cites them, drafts the reply",
  },
];

export const featureBySlug = Object.fromEntries(features.map((feature) => [feature.slug, feature]));
