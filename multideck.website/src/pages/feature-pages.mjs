/* The six feature pages. Each is built from the shared structure in
   feature-page.mjs, with its own operational detail and its own set of media
   slots. Screenshot slots state what should be on screen when the shot is taken,
   so filling them in is a matter of capturing what the note describes. */

import { shot } from "../media.mjs";
import { featurePage } from "./feature-page.mjs";

/* ------------------------------------------------------------- sales & CRM -- */

export const salesCrm = featurePage({
  slug: "sales-crm",
  title: ["Turn freight enquiries", "into organised,", "actionable customer work."],
  lede: "Every opportunity gets an owner, a price, and a next action, and a won quote becomes a live booking rather than the starting point for typing the whole job out again.",
  description:
    "Multideck Sales & CRM turns freight enquiries into organised customer work: one pipeline for enquiries, quotes and accounts, with won quotes flowing straight into live bookings.",
  pull: "Enquiries do not get lost because people are careless. They get lost because they live in an inbox.",
  heroShot: {
    label: "The sales pipeline",
    note: "Qualifying, quoted, and won columns with lane, value, owner, and rate expiry on every card.",
    caption: "Where the money is, not just where the emails are",
    captionMeta: "Sales & CRM",
    priority: true,
  },
  problem: {
    title: ["A busy desk can still be", "leaving money on the table."],
    lede: "The enquiry sits in one person's mail, the rate that was offered sits in a spreadsheet, and the reason it was offered sits in someone's head.",
    aside: `<p class="body-sm">That makes ordinary commercial questions hard to answer. Which open quotes are worth chasing today? Which rates expire this week? Which customer has gone quiet since we priced their last three lanes?</p>`,
    items: [
      {
        term: "The rate is in a spreadsheet",
        text: "Priced in a tab called rates_final_v3, with no link to the enquiry it belongs to and no record of why that number was chosen.",
      },
      {
        term: "Expiry is invisible",
        text: "Nobody can say which quotes go stale this week, so customers come back asking for a re-quote and the desk starts again.",
      },
      {
        term: "Acceptance means retyping",
        text: "When the customer says yes, the entire job is typed out again from the email thread that won it.",
      },
      {
        term: "Cover is archaeology",
        text: "Standing in for a colleague starts with reading three months of threads instead of doing the work.",
      },
    ],
  },
  resultsTitle: ["What changes on the sales side."],
  results: [
    {
      value: "One pipeline",
      label: "Enquiries, quotes, accounts, and contacts in a single view, each with a value and a named owner.",
    },
    {
      value: "Zero re-entry",
      label: "A won quote becomes the job file with its charges, parties, equipment, and references intact.",
    },
    {
      value: "Expiry in view",
      label: "You can see which quotes go stale this week, before a customer comes back asking for a re-quote.",
    },
  ],
  tour: {
    label: "From enquiry to won",
    end: "Quotes",
    media: shot({
      label: "Quote detail",
      note: "Charge lines for freight, THC, customs entry, haulage, and insurance, with sell against cost and the margin percentage.",
      ratio: "4 / 3",
      caption: "Priced from your own charge lines",
      captionMeta: "Quotes",
    }),
    blocks: [
      {
        label: "Qualify",
        title: "An enquiry with a value and a date beats an enquiry with a flag.",
        text: "Opportunities carry the lane, the equipment, the readiness date, and the person responsible. Sorting by what is at risk this week is one click rather than an afternoon of reading.",
      },
      {
        label: "Price",
        title: "Build the quote from the charges your business actually uses.",
        text: "Freight, origin THC, customs entry, haulage, and insurance, with sell against cost so margin is a number you set rather than one you discover at invoicing. Save the shape of a quote for a lane or a customer and the next one takes minutes.",
      },
      {
        label: "Commit",
        title: "Validity is explicit, so a stale price cannot be quietly accepted.",
        text: "Every quote carries its expiry and the rate it was built on. When it is accepted, the charges, parties, equipment, and references move into the booking and the customs task without anyone retyping them.",
      },
    ],
  },
  duo: {
    label: "Accounts",
    title: "Cover becomes a handover, not an investigation.",
    body: "Everything said to a customer sits on their record: quotes issued, calls logged, emails sent and received, volumes and margin over time. Anyone picking up the account can be useful the same morning.",
    outcomes: [
      {
        icon: "users",
        title: "Contacts and roles are explicit",
        text: "You know who signs off, who books the delivery slot, and who chases the invoice, with the history to prove it.",
      },
      {
        icon: "gauge",
        title: "Account health is a fact, not a feeling",
        text: "Volume, revenue, and average margin across twelve months, next to the lanes those numbers came from.",
      },
    ],
    media: shot({
      label: "Customer account record",
      note: "Account owner, open bookings, quarterly volume, twelve-month revenue and margin, top lane, and the recent activity feed.",
      ratio: "16 / 11",
      caption: "One account, everything said and sent",
      captionMeta: "CRM",
    }),
    flip: true,
  },
  midCta: {
    statement: "Bring one real enquiry and one quote you issued last week.",
    body: [
      "We will build both in Multideck while you watch, using your charge lines and your lanes. It is the fastest way to find out whether this fits how you actually sell.",
      "Thirty minutes, no slides, and an honest answer at the end about whether it is worth going further.",
    ],
  },
  connects: {
    title: "A quote is only worth something if the rest of the job knows about it.",
    lede: "Winning the work is step one of six. What makes it valuable is that the next five start from what you already agreed.",
  },
  close: {
    title: "See your own pipeline in Multideck.",
    lede: "Tell us how enquiries reach you today and who owns them. We will show you the same work in one place.",
  },
});

/* ---------------------------------------------------------------- bookings -- */

export const bookings = featurePage({
  slug: "bookings",
  title: ["Confirmed work becomes", "an organised job,", "not a data-entry task."],
  lede: "The booking is the job file: its references, documents, milestones, financials, and the conversation with the customer, all in the place your team already has open.",
  description:
    "Multideck bookings turn confirmed freight into an organised job file: references, documents, milestones, margin, and customer emails on one record, with the next action always named.",
  pull: "Winning the job is the easy part. Everything after it is admin nobody owns.",
  heroShot: {
    label: "The bookings register",
    note: "Forty-one live jobs with lane, carrier, progress, ETA, and exceptions sorted to the top.",
    caption: "Forty-one live jobs, and the three that need you today",
    captionMeta: "Bookings",
    priority: true,
  },
  problem: {
    title: ["A confirmed booking sets off", "a chain of small obligations."],
    lede: "Submit the entry, chase the bill of lading, send the arrival notice, book the delivery slot, raise the invoice. None of them is difficult. All of them are easy to miss.",
    aside: `<p class="body-sm">The usual answer is a spreadsheet of jobs and a shared calendar, kept alive by the two people who care most. It works until someone is ill, volumes rise, or a customer asks what happened three weeks ago.</p>`,
    items: [
      {
        term: "The job lives in a spreadsheet",
        text: "Colour-coded by whoever built it, understood by two people, and impossible to hand over without a conversation.",
      },
      {
        term: "Chasing happens on discovery",
        text: "The bill of lading is chased when somebody notices it is missing, rather than when it became due.",
      },
      {
        term: "The same booking exists four times",
        text: "In the carrier portal, the customs system, and the accounts package, with three slightly different versions of the customer's name.",
      },
      {
        term: "Margin arrives as a surprise",
        text: "Booked costs creep up quietly and the real number appears at invoicing, when nothing can be done about it.",
      },
    ],
  },
  resultsTitle: ["What changes once the job has a home."],
  results: [
    {
      value: "One job file",
      label: "Operations, customs, and accounts read the same record instead of three copies of it.",
    },
    {
      value: "A named next action",
      label: "Every booking shows what is due, when, and who owns it, including the things nobody enjoys chasing.",
    },
    {
      value: "Margin from day one",
      label: "Sell, booked cost, and realised margin sit on the job while there is still time to act on them.",
    },
  ],
  tour: {
    label: "Inside a job file",
    end: "MD-22481",
    media: shot({
      label: "Booking detail",
      note: "Job file for one shipment: parties, references, vessel, equipment, document states, milestones with owners, and the financial summary.",
      ratio: "4 / 3",
      caption: "Everything about the shipment, on the shipment",
      captionMeta: "Booking detail",
    }),
    blocks: [
      {
        label: "References",
        title: "Customer ref, supplier ref, job ref: carried, not recreated.",
        text: "The references a customer quotes at you on the phone are on the record, so a job can be found by any of them. Vessel, voyage, equipment, and sailing dates sit alongside them rather than in a carrier portal.",
      },
      {
        label: "Milestones",
        title: "“Arrival notice due 02 June: Ella” is a commitment.",
        text: "A row in a spreadsheet is a hope. Milestones carry an owner and a date, and the ones that have slipped are the reason the register is ordered the way it is.",
      },
      {
        label: "Documents",
        title: "Six of seven present, one being chased.",
        text: "Documents belong to the job, and each is read and checked against what the booking says. You can see at a glance which job is short of paperwork and which document is holding it up.",
      },
      {
        label: "Financials",
        title: "Invoicing becomes a review rather than a rebuild.",
        text: "Agreed sell rates and surcharges are already on the record from the quote. The invoice draft comes from the job, so the only work left is checking it.",
      },
    ],
  },
  duo: {
    label: "Customer conversation",
    title: "The email thread is part of the job, not a separate universe.",
    body: "Connect Outlook or Gmail and the messages about a shipment sit against that shipment. When a customer asks whether the handover still holds, the answer is already on screen: current ETA, cleared documents, and booked delivery slot.",
    outcomes: [
      {
        icon: "mail",
        title: "No hunting for the thread",
        text: "Incoming mail is matched to the booking by reference, container, or sender, and stays attached to it.",
      },
      {
        icon: "shield",
        title: "Access stays with the mailbox",
        text: "Multideck reads and sends through your own authorised mailbox permissions. Nothing is copied out into a separate mail store.",
      },
    ],
    media: shot({
      label: "Booking inbox",
      note: "A customer email about a shipment, with the booking's current ETA, cleared documents, and delivery slot beside it.",
      ratio: "16 / 11",
      caption: "The question and the answer, on one screen",
      captionMeta: "Inbox",
    }),
  },
  midCta: {
    statement: "Bring the spreadsheet you run jobs from.",
    body: [
      "We will map it onto Multideck bookings during the session and show you exactly which columns stop being your responsibility.",
      "If some of them should stay in a spreadsheet, we will say so. Not everything belongs in a system.",
    ],
  },
  connects: {
    title: "The booking is where the rest of the workspace gets its facts.",
    lede: "Paperwork, declarations, tracking, and customer updates all read from this record, which is why entering it once is worth so much.",
  },
  close: {
    title: "Put your live jobs on one board.",
    lede: "Tell us how many bookings you run a month and how you track them today. We will show you the same work with the admin taken out.",
  },
});

/* --------------------------------------------------------------- AutoDoc -- */

export const documentExtraction = featurePage({
  slug: "document-extraction",
  label: "Stop retyping",
  title: ["Read every document once.", "Let the values land", "where they belong."],
  lede: "Invoices, packing lists, bills of lading, and a driver's photo of a CMR are opened, identified, matched to the right job, and checked against what you already declared.",
  description:
    "Multideck reads freight paperwork, including invoices, packing lists, bills of lading, and CMRs, matches each document to the right booking, and checks the values against the job before anything is written.",
  pull: "Freight is a paperwork business, and the paperwork arrives as pictures.",
  heroShot: {
    label: "The paper tray",
    note: "Everything that arrived today, each file matched to its booking, with the fields read and the conflicts flagged.",
    caption: "Fourteen files arrived. Twelve already know their job.",
    captionMeta: "Documents",
    priority: true,
  },
  problem: {
    title: ["A single shipment can generate", "a dozen documents", "in six different layouts."],
    lede: "None of them arrive as clean data. They arrive as a PDF, a scan, or a photograph taken in a lorry cab at night, and then somebody types the numbers in again.",
    aside: `<p class="body-sm">The expensive mistakes are usually not typos. They are two documents that disagree with each other, and nobody compared them until an officer did.</p>`,
    items: [
      {
        term: "The same value, typed three times",
        text: "Gross weight goes into the booking, then the declaration, then the invoice check. Three opportunities for the desk to disagree with itself.",
      },
      {
        term: "Paperwork arrives anywhere",
        text: "A photo of a CMR sits in a messaging thread until somebody files it by hand, and the job is not complete until they do.",
      },
      {
        term: "Nobody compares the documents",
        text: "The invoice says nineteen cartons and the packing list says eighteen. Both are on file. Neither was checked against the other.",
      },
      {
        term: "Provenance disappears",
        text: "When a declared figure is questioned weeks later, nobody can say which document it was read from.",
      },
    ],
  },
  resultsTitle: ["What changes when the system does the reading."],
  results: [
    {
      value: "Read once",
      label: "Each document is opened, identified, and read on arrival, then reused everywhere it is needed.",
    },
    {
      value: "Every value sourced",
      label: "You can see the page and the box a figure came from, and whether it was read directly or inferred.",
    },
    {
      value: "Conflicts raised early",
      label: "Documents that disagree with each other are flagged before the declaration goes near a border.",
    },
  ],
  tour: {
    label: "How a document is handled",
    end: "Evidence",
    media: shot({
      src: "/assets/shots/document-extraction.png",
      alt: "A commercial invoice with Multideck extraction callouts for the invoice number, supplier and address",
      label: "Document evidence view",
      note: "The document on one side and the values taken from it on the other, with a box over the place each figure was read: solid where read directly and dashed where inferred.",
      ratio: "1 / 1",
      caption: "Every number keeps a pointer back to its source",
      captionMeta: "Evidence",
    }),
    blocks: [
      {
        label: "Matched",
        title: "Attached to the right job before anyone opens it.",
        text: "Container numbers, supplier references, invoice numbers, and job references are enough to place most documents automatically. The ones that cannot be matched wait in one place to be assigned, rather than scattering across inboxes.",
      },
      {
        label: "Read",
        title: "Identified by type, then read on its own terms.",
        text: "A bill of lading and a commercial invoice are not the same shape, so they are not read the same way. Multi-document scans are separated into the documents they contain, and phone-camera photographs are straightened first.",
      },
      {
        label: "Checked",
        title: "Compared against the job, and against the other documents.",
        text: "Where a figure agrees with the booking it is marked as verified. Where two documents disagree, both values are shown with their sources so a person makes the call.",
      },
      {
        label: "Accepted",
        title: "Nothing is written to the job until you accept it.",
        text: "Extracted values are proposals. Accept four and query one; the accepted values then flow into the declaration, the arrival notice, and the invoice check without further typing.",
      },
    ],
  },
  duo: {
    label: "Coverage",
    title: "The documents your desk actually receives.",
    body: "Not a generic file reader. Each document type has a known shape, a set of fields worth taking, and a way of identifying which job it belongs to. That is what makes matching work before anyone has opened it.",
    outcomes: [
      {
        icon: "layers",
        title: "Commercial documents",
        text: "Commercial invoices, packing lists, certificates of origin: parties, incoterms, currencies, line values, weights, volumes, marks and numbers.",
      },
      {
        icon: "ship",
        title: "Transport documents",
        text: "Bills of lading, air waybills, CMRs, arrival notices: containers and seals, vessel and voyage, flights, free time, and charges due.",
      },
      {
        icon: "scanText",
        title: "Whatever the driver sends",
        text: "Skewed, shadowed, phone-camera scans of delivery notes and signed CMRs, because that is how road paperwork actually arrives.",
      },
    ],
    media: shot({
      label: "Document type register",
      note: "The document types the workspace reads, the fields it takes from each, and how each is matched to a job.",
      ratio: "16 / 12",
      caption: "Known shapes, known fields, known matching",
      captionMeta: "Coverage",
    }),
    flip: true,
  },
  midCta: {
    statement: "Send us three of your ugliest documents.",
    body: [
      "A supplier invoice in an odd layout, a scanned packing list, and a photo of a CMR taken on a phone. We will read them during the session and show you exactly what lands on the job.",
      "If one of them defeats us, you will see that too. It is a more useful test than a clean sample file.",
    ],
  },
  connects: {
    title: "Reading the paperwork is what makes the rest of the workspace cheap to run.",
    lede: "Declarations, arrival notices, invoice checks, and customer updates all pull from values that were read once and sourced properly.",
  },
  close: {
    title: "Stop typing what the document already says.",
    lede: "Tell us which documents eat the most time on your desk. We will show you what Multideck takes off it.",
  },
});

/* ----------------------------------------------------------------- customs -- */

export const customs = featurePage({
  slug: "customs",
  title: ["Declarations, documents,", "and exceptions", "with a state you can see."],
  lede: "Entries are prepared from the booking rather than from scratch, every declared value has a source, and anything that would become a hold is raised while it is still cheap to fix.",
  description:
    "Multideck customs keeps declarations, documents, progress, and exceptions in one controlled view, with entries prefilled from the booking, values sourced from the paperwork, and holds surfaced early.",
  pull: "Customs work is not hard. Customs work with missing information is brutal.",
  heroShot: {
    label: "The declarations register",
    note: "Export and import entries, transit movements and licences with type, MRN, progress, and blocked work at the top.",
    caption: "Every declaration, and how far it has got",
    captionMeta: "Customs",
    priority: true,
  },
  problem: {
    title: ["Declarations are routine.", "The information around them", "is not."],
    lede: "What costs money is the licence nobody requested, the commodity code nobody confirmed, the packing list that disagrees with the invoice, and the free time running out while all of that is sorted.",
    aside: `<p class="body-sm">In most setups the declaration lives in separate software, so the operational team cannot see its state and the customs team cannot see the commercial context. Both chase each other for information the other assumed was obvious.</p>`,
    items: [
      {
        term: "The entry is somewhere else",
        text: "Operations cannot see whether it has been submitted, accepted, or is sitting in draft waiting for one field.",
      },
      {
        term: "Values are typed twice",
        text: "Parties, commodity codes, and statistical values are entered again from documents already sitting on the job.",
      },
      {
        term: "Licences surface too late",
        text: "A missing export licence is discovered after booking rather than during qualification, when it was still a question and not a hold.",
      },
      {
        term: "Nobody prices the delay",
        text: "A hold has a daily cost in demurrage or storage, and almost nobody can put a number on the one they are currently living with.",
      },
    ],
  },
  resultsTitle: ["What changes when customs sits inside the job."],
  results: [
    {
      value: "Prefilled entries",
      label: "Parties, commodity, values, and procedure come from the booking and the documents already read.",
    },
    {
      value: "One exception queue",
      label: "Licence gaps, mismatched paperwork, and outstanding MSDS in a single list your whole desk can see.",
    },
    {
      value: "Cost attached",
      label: "Where a rate is known, an exception carries the demurrage or storage exposure of leaving it alone.",
    },
  ],
  tour: {
    label: "One declaration, end to end",
    end: "CDS",
    media: shot({
      label: "Declaration workspace",
      note: "A CDS entry with declarant, EORI, MRN, commodity, statistical value and procedure, its progress, and the values read from the commercial invoice beside it.",
      ratio: "4 / 3",
      caption: "The entry and its evidence, together",
      captionMeta: "Declaration",
    }),
    blocks: [
      {
        label: "Prepare",
        title: "Start from the record, not a blank form.",
        text: "Parties, commodity, statistical value, and procedure come from the booking and the paperwork already read. What is left is the judgement, which is the part that needed a customs person anyway.",
      },
      {
        label: "Evidence",
        title: "Every declared figure can be traced to a document.",
        text: "The value on the entry links back to the page and box it was read from. When a figure is queried after clearance, the source is still attached to the job.",
      },
      {
        label: "State",
        title: "Draft, submitted, accepted, permission to progress, cleared.",
        text: "With timestamps rather than somebody's recollection, and visible to the operator who is talking to the customer, not only to the customs desk.",
      },
      {
        label: "Exceptions",
        title: "Ordered by what the delay actually costs.",
        text: "Licence gaps, document mismatches, and outstanding MSDS in one queue, with free time remaining and the daily exposure where the rate is known.",
      },
    ],
  },
  duo: {
    label: "Patterns",
    title: "When the same hold happens three times, that is a process problem.",
    body: "Multideck groups exceptions by cause rather than by date. Three licence holds in a quarter that all share one gap, the shipper being asked after booking instead of at qualification, is one fix, not three incidents.",
    outcomes: [
      {
        icon: "workflow",
        title: "A pattern can become a rule",
        text: "Turn a recurring cause into a check that fires during qualification, so the lane stops producing the same hold.",
      },
      {
        icon: "link",
        title: "The evidence comes with it",
        text: "Each pattern lists the specific bookings behind it, so you can verify the claim before changing how the desk works.",
      },
      {
        icon: "receipt",
        title: "Ranked by cost, not frequency",
        text: "Three holds worth eleven lost days outrank six document queries that cost an hour each.",
      },
    ],
    media: shot({
      label: "Exceptions grouped by cause",
      note: "Recurring causes ranked by cost, with the specific bookings behind the top one listed beside it.",
      ratio: "16 / 11",
      caption: "Three incidents, or one fixable gap",
      captionMeta: "Patterns",
    }),
    flip: true,
  },
  midCta: {
    statement: "Bring your last three customs holds.",
    body: [
      "We will walk through where Multideck would have raised each of them, how early, and what the delay actually cost you.",
      "If the answer is that two of them were unavoidable, we will say so. The third is usually the interesting one.",
    ],
  },
  connects: {
    title: "Customs is only calm when the steps either side of it are honest.",
    lede: "A declaration is quick to prepare because the booking and the paperwork are already right, and its state is visible to the people talking to the customer.",
  },
  close: {
    title: "Bring your declarations into the same workspace as the job.",
    lede: "Tell us whether you clear in-house or through a broker, and which regimes you file under. We will show you how it fits.",
  },
});

/* ----------------------------------------------------------- live tracking -- */

export const liveTracking = featurePage({
  slug: "live-tracking",
  title: ["Know what is moving.", "Know what changed.", "Before anyone asks."],
  lede: "One board for every active job, the change history behind each one, and a customer view generated from the same milestones your operators work from, so the two can never disagree.",
  description:
    "Multideck live tracking gives freight teams one board for what is moving, what has changed, and what needs attention, plus a customer view generated from the same milestones.",
  pull: "Your customers find out about delays by asking you.",
  heroShot: {
    label: "The tracking control room",
    note: "Every active lane with progress against it, revised ETAs, the change reason, and the free-time watch alongside.",
    caption: "What is moving, and what is about to cost money",
    captionMeta: "Live tracking",
    priority: true,
  },
  problem: {
    title: ["Carrier portals know", "when a vessel slips.", "Your customer knows", "when they call."],
    lede: "In between sits an operator opening four screens to reassemble a story they could have been told automatically.",
    aside: `<p class="body-sm">The cost is not only the interruption. It is the credibility of the answer: a date given from memory, a delay explained without a cause, a delivery slot nobody has actually rebooked.</p>`,
    items: [
      {
        term: "Four portals, four logins",
        text: "Each carrier has its own idea of a milestone, and none of them knows about your delivery slot or your customer's deadline.",
      },
      {
        term: "Updates are pulled, not pushed",
        text: "The customer hears about a delay because they emailed to ask, which is the most expensive possible moment to find out.",
      },
      {
        term: "Free time expires quietly",
        text: "Demurrage appears on a supplier invoice weeks later, by which point it is a cost to absorb rather than a risk to manage.",
      },
      {
        term: "Two versions of the truth",
        text: "The tracking page a customer looks at and the dates your team works from drift apart, and the customer notices first.",
      },
    ],
  },
  resultsTitle: ["What changes when everything moving is on one board."],
  results: [
    {
      value: "One board",
      label: "Every active job with its lane, progress, ETA, and the time its last update arrived.",
    },
    {
      value: "Change history",
      label: "Not just the current ETA, but what it was, when it moved, why, and who was told.",
    },
    {
      value: "No customer login",
      label: "A shipment view you can share, showing only that customer's references, dates, and contact.",
    },
  ],
  tour: {
    label: "One shipment, one change",
    end: "MD-22479",
    media: shot({
      label: "Shipment change history",
      note: "The milestone rail for one booking: gate in, loaded, the ETA revision with its cause, the customer notification, and the delivery still to rebook.",
      ratio: "4 / 3",
      caption: "What changed, why, and who was told",
      captionMeta: "History",
    }),
    blocks: [
      {
        label: "Detect",
        title: "The schedule moves, and the record moves with it.",
        text: "A revised carrier ETA lands on the booking rather than in a portal you have to remember to check. The old date stays on the history, because the promise you made was based on it.",
      },
      {
        label: "Assess",
        title: "The consequence, not just the event.",
        text: "A 36-hour slip matters because there is a delivery slot booked on the old date and a customer who was given it. The board shows the knock-on, not only the change.",
      },
      {
        label: "Tell",
        title: "The customer hears it from you first.",
        text: "The revised window goes out with the real reason and a plan, from the operator who owns the job, and the notification is recorded against the shipment so nobody sends a second one.",
      },
    ],
  },
  duo: {
    label: "Watchers",
    title: "The workspace tells you before you think to look.",
    body: "Write the risks your lanes keep producing as watchers: free time under three days, an ETA moving more than half a day after the customer was given a date, a document still missing at cut-off, margin slipping under what was quoted.",
    outcomes: [
      {
        icon: "bell",
        title: "It lands on the job, not in an alerts inbox",
        text: "A firing watcher appears on the booking and in the queue of the operator who owns it, not in a digest nobody reads.",
      },
      {
        icon: "receipt",
        title: "With the cost of ignoring it",
        text: "Where the demurrage or storage rate is known, the exposure is shown next to the warning.",
      },
      {
        icon: "send",
        title: "And usually with a response ready",
        text: "The chase, the rebooking, or the customer note is prepared for the owner to approve.",
      },
    ],
    media: shot({
      label: "Watchers",
      note: "Active watchers with their rules and which are currently firing, and what happens when one does.",
      ratio: "16 / 11",
      caption: "Written by you, watched by the workspace",
      captionMeta: "Watchers",
    }),
  },
  midCta: {
    statement: "Pick a shipment that went wrong last month.",
    body: [
      "We will replay it on the Multideck board and show you the point at which you would have known, and what you could have told the customer then.",
      "Bring the email you actually had to send. Comparing the two is the whole demonstration.",
    ],
  },
  connects: {
    title: "Tracking is only trustworthy if it comes from the operational record.",
    lede: "The board reads the same bookings, documents, and declarations your team works from, which is why the customer view and the internal view are the same thing.",
  },
  close: {
    title: "Put everything moving on one board.",
    lede: "Tell us which carriers and modes you use and how customers ask for updates today. We will show you the difference.",
  },
});

/* ------------------------------------------------------------------ Dexter -- */

export const dexter = featurePage({
  slug: "dexter",
  title: ["Help that reads", "your shipments,", "not just your question."],
  lede: "Dexter works from the bookings, declarations, schedules, and email threads your team already uses, then explains what is happening, what it costs, and what to say, with the draft ready for you to approve.",
  description:
    "Dexter is Multideck's operational assistant: it reads your live bookings, declarations, schedules and email threads, cites its sources, and prepares drafts you approve before anything is sent.",
  pull: "An operator's hardest question is not “how do I word this?”. It is “what is actually going on with this job?”.",
  heroShot: {
    label: "Dexter answering on a held shipment",
    note: "The cause of the hold, the responsible party, the dates on record, and the daily exposure, with every claim linked to its source record.",
    caption: "Cited, specific, and about your job",
    captionMeta: "Dexter",
    priority: true,
  },
  problem: {
    title: ["Answering it means reading", "five things and then deciding."],
    lede: "A booking, a declaration, a carrier schedule, a tariff, and an email thread. A tool that cannot see any of those can only produce fluent text you then have to check line by line.",
    aside: `<p class="body-sm">Which is slower than writing it yourself. Dexter is built the other way round: it starts from your live records, cites what it read, and hands you something specific enough to send.</p>`,
    items: [
      {
        term: "It cannot see the booking",
        text: "So the specifics have to be pasted in by hand, which is most of the work you were trying to avoid.",
      },
      {
        term: "It cannot cite a source",
        text: "So every claim has to be verified against the record anyway, and the time saved is spent checking.",
      },
      {
        term: "It is confident about dates it cannot know",
        text: "Which is worse than unhelpful on a desk where a wrong date becomes a promise to a customer.",
      },
      {
        term: "It cannot do anything",
        text: "The operator still opens four screens to act on whatever it suggested.",
      },
    ],
  },
  resultsTitle: ["What changes when the help can read your data."],
  results: [
    {
      value: "Cited answers",
      label: "Every claim links to the booking, thread, or schedule it came from, so you can check it in one click.",
    },
    {
      value: "Drafts you approve",
      label: "Chases, customer updates, and amendments prepared in your wording, sent only when you say so.",
    },
    {
      value: "Patterns, not noise",
      label: "When the same exception recurs, Dexter shows the cause and offers to watch for it earlier.",
    },
  ],
  tour: {
    label: "What it actually does",
    end: "Approval",
    media: shot({
      label: "A customer update prepared for approval",
      note: "The revised window drafted from the booking, the vessel schedule and the delivery slot: editable, in the operator's voice, and unsent.",
      ratio: "4 / 3",
      caption: "Drafted in your words, sent by you",
      captionMeta: "Approval",
    }),
    blocks: [
      {
        label: "Explain",
        title: "The cause, the party, the dates, the exposure.",
        text: "“It is held because the export licence was never received from the shipper: requested on the 21st, chased on the 26th, no reply. Free time ends in two days, so the exposure is about €340 a day after that.” Each part links to where it was read.",
      },
      {
        label: "Prepare",
        title: "Written from the record, not from a template.",
        text: "A customer update is built from the booking, the vessel schedule, and the delivery slot. You can edit the whole thing, or select one passage and change just that without regenerating a message you were happy with.",
      },
      {
        label: "Approve",
        title: "Nothing leaves without a person sending it.",
        text: "Drafts sit in the composer until the operator whose mailbox it is sends them, through the mailbox permissions your team already granted. Sent means the provider confirmed it.",
      },
      {
        label: "Learn",
        title: "Three of the same exception is a pattern worth naming.",
        text: "Dexter groups recurring causes, shows the specific jobs behind each, and offers to turn the cause into a check that fires earlier in the workflow.",
      },
    ],
  },
  duo: {
    label: "In context",
    title: "Ask about the thing you are looking at.",
    body: "Hold the platform modifier and double-click any element, or press ⌘D, and Dexter takes that element as its subject: this declaration line, this document field, or this booking row. No copying references into a chat box.",
    outcomes: [
      {
        icon: "target",
        title: "The context is the selection",
        text: "Asking about a carton count on a packing list gives you an answer about that carton count, on that job.",
      },
      {
        icon: "workflow",
        title: "It can offer the fix",
        text: "Amend the entry to nineteen, or query it with the supplier. Those are the two things an operator would actually do next.",
      },
      {
        icon: "shield",
        title: "It only sees what you can see",
        text: "Dexter works within the permissions of the person asking. It gains no access your team has not granted.",
      },
    ],
    media: shot({
      label: "Asking about a selected element",
      note: "A booking row selected with the summon ring, and the prompt box opened against it carrying that element's context.",
      ratio: "16 / 11",
      caption: "The selection is the question",
      captionMeta: "Summon",
    }),
    flip: true,
  },
  midCta: {
    statement: "Ask Dexter something about your own operation.",
    body: [
      "In the session, put a real question to a workspace loaded with your lanes, such as a held shipment, a margin query, or a customer chase, and judge the answer on one thing: whether you would send it.",
      "That is a harder test than a scripted demo, and the only one worth running.",
    ],
  },
  connects: {
    title: "Dexter is only useful because the other five steps are joined up.",
    lede: "It can explain a hold and draft a revised window because the quote, the booking, the paperwork, the declaration, and the movement are all one record.",
  },
  close: {
    title: "Judge it on your own held shipment.",
    lede: "Bring a job that went wrong and the email you had to write about it. That is the fairest test there is.",
  },
});

export const featurePages = [salesCrm, bookings, documentExtraction, customs, liveTracking, dexter];
