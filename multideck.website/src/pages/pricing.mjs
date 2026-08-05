const plans = [
  {
    id: "25",
    name: "Multideck 25",
    range: "Up to 25 users",
    price: "£5,000",
    commitment: "£60,000 over 12 months",
    summary: "For smaller freight teams moving their operation into one connected workspace.",
    allowance: "12,500 documents · 200 customs declarations",
  },
  {
    id: "50",
    name: "Multideck 50",
    range: "Up to 50 users",
    price: "£8,000",
    commitment: "£96,000 over 12 months",
    summary: "For growing teams that need more operational capacity without a per-user penalty.",
    allowance: "25,000 documents · 350 customs declarations",
    recommended: true,
  },
  {
    id: "75",
    name: "Multideck 75",
    range: "Up to 75 users",
    price: "£10,000",
    commitment: "£120,000 over 12 months",
    summary: "For established operations coordinating higher document, customs and AI volumes.",
    allowance: "37,500 documents · 500 customs declarations",
  },
  {
    id: "enterprise",
    name: "Multideck Enterprise",
    range: "More than 75 users",
    price: "Speak with us",
    commitment: "Pricing shaped around your operation",
    summary: "For larger or more complex operations that need a plan built around their real volumes.",
    custom: true,
  },
];

const comparisonGroups = [
  {
    label: "Price and capacity",
    rows: [
      ["Monthly price", "£5,000", "£8,000", "£10,000", true],
      ["Included users", "Up to 25", "Up to 50", "Up to 75"],
      ["Price per user", "£200", "£160", "£133"],
    ],
  },
  {
    label: "Documents and customs",
    rows: [
      ["Documents extracted each month", "12,500", "25,000", "37,500", true],
      ["Pages converted into usable data each month", "25,000", "50,000", "75,000"],
      ["Customs declarations each month", "200", "350", "500"],
    ],
  },
  {
    label: "Dexter AI messages",
    rows: [
      ["Estimated Fast messages", "44,000–88,000", "81,000–163,000", "113,000–225,000"],
      ["Estimated Smart messages", "15,000–44,000", "27,000–81,000", "38,000–113,000"],
      ["Estimated Worker messages", "4,400–15,000", "8,100–27,000", "11,000–38,000"],
    ],
  },
  {
    label: "Included in every plan",
    rows: [
      ["Private company data and file storage", "Included", "Included", "Included"],
      ["Secure user accounts and permissions", "Included", "Included", "Included"],
      ["Multideck workspace and customer portal", "Included", "Included", "Included"],
      ["Email delivery, service monitoring and backups", "Included", "Included", "Included"],
      ["Product updates and ongoing support", "Included", "Included", "Included"],
    ],
  },
];

const planCards = plans
  .map(
    (plan, index) => `<article class="price-plan rv" style="--d:${index * 55}ms"${
      plan.custom ? ' data-custom="true"' : ""
    }${plan.recommended ? ' data-recommended="true"' : ""}>
      <div class="price-plan-copy">
        <div class="price-plan-heading">
          <p class="price-plan-name">${plan.name}</p>
          ${plan.recommended ? '<span class="price-plan-recommended">Most popular</span>' : ""}
        </div>
        <h2 class="price-plan-range">${plan.range}</h2>
        <p class="price-plan-price${plan.custom ? " price-plan-price-custom" : ""}">${plan.price}${
          plan.custom ? "" : '<span class="price-plan-period">/ month</span>'
        }</p>
        <p class="price-plan-commitment">${plan.commitment}</p>
        <p class="price-plan-summary">${plan.summary}</p>
        ${plan.allowance ? `<p class="price-plan-allowance">${plan.allowance}</p>` : ""}
      </div>
      <div class="price-plan-action">
        <p class="price-plan-term">${plan.custom ? "Custom agreement" : "12-month agreement"}</p>
        ${
          plan.custom
            ? '<a class="btn price-plan-button" href="/contact#enquire">Speak with our team</a>'
            : `<div class="price-plan-actions">
                <a class="price-plan-compare" href="#compare-plans">Compare ${plan.name}</a>
                <a class="btn price-plan-button" href="/contact#enquire">Enquire about ${plan.name}</a>
              </div>`
        }
      </div>
    </article>`,
  )
  .join("");

const comparisonRows = comparisonGroups
  .map(
    (group) => `<tbody>
      <tr class="plan-compare-group"><th colspan="4" scope="colgroup">${group.label}</th></tr>
      ${group.rows
        .map(
          ([label, plan25, plan50, plan75, emphasized]) => `<tr${emphasized ? ' data-emphasis="true"' : ""}>
            <th scope="row">${label}</th>
            <td><span>${plan25}</span></td>
            <td><span>${plan50}</span></td>
            <td><span>${plan75}</span></td>
          </tr>`,
        )
        .join("")}
    </tbody>`,
  )
  .join("");

export const pricing = {
  route: "/pricing",
  title: "Pricing",
  description:
    "Multideck pricing for freight-forwarding teams: £5,000 a month for up to 25 users, with document data extraction, customs, AI and a private workspace included.",
  body: () => `
    <section class="pricing-intro" aria-labelledby="pricing-title">
      <div class="shell">
        <div class="pricing-heading">
          <p class="pricing-kicker rv">One workspace. One clear monthly price.</p>
          <h1 class="pricing-title" id="pricing-title">Pricing that grows <br>with your operation.</h1>
          <p class="pricing-lede">Extracting data from your documents, customs declarations, Dexter AI and your own private Multideck workspace are included. Choose the capacity that fits your team today.</p>
        </div>

        <div class="price-plans">${planCards}</div>
      </div>
    </section>

    <section class="plan-compare" id="compare-plans" aria-labelledby="compare-plans-title">
      <div class="shell">
        <div class="plan-compare-heading">
          <div>
            <p class="label rv">Compare plans</p>
            <h2 class="plan-compare-title rv" id="compare-plans-title" style="--d:60ms">See exactly what is included.</h2>
          </div>
          <p class="plan-compare-lede rv" style="--d:120ms">Compare each allowance side by side. Every plan includes the full Multideck workspace; only team size and monthly allowances change.</p>
        </div>

        <div class="plan-compare-table-wrap rv" style="--d:160ms">
          <table class="plan-compare-table">
            <caption class="sr">Monthly Multideck plan prices, usage allowances and included features</caption>
            <thead>
              <tr>
                <th scope="col">Plan details</th>
                <th scope="col">Multideck 25</th>
                <th scope="col">Multideck 50</th>
                <th scope="col">Multideck 75</th>
              </tr>
            </thead>
            ${comparisonRows}
          </table>
        </div>

        <div class="plan-compare-notes rv" style="--d:210ms">
          <p>AI message estimates show alternative usage patterns. Fast, Smart and Worker estimates are not added together.</p>
        </div>
      </div>
    </section>

    <section class="pricing-calculator" id="pricing-calculator" aria-labelledby="pricing-calculator-title">
      <div class="shell pricing-calculator-shell">
        <div class="price-calculator rv" data-pricing-calculator style="--slider-position:46.1%">
          <div class="price-calculator-heading">
            <h2 class="price-calculator-title" id="pricing-calculator-title">Find the right plan <br>for your team.</h2>
            <p class="price-calculator-lede" id="team-size-description">Choose your team size to see the monthly price and full 12-month commitment.</p>
          </div>

          <div class="price-calculator-control">
            <div class="price-calculator-value-row">
              <label class="price-calculator-label" for="team-size">Team size</label>
              <output class="price-calculator-count" for="team-size" data-team-count>42 <span>users</span></output>
            </div>

            <div class="price-slider-wrap">
              <output class="price-slider-tier" for="team-size" data-team-tier>Multideck 50</output>
              <input
                class="price-slider"
                id="team-size"
                name="team-size"
                type="range"
                min="1"
                max="90"
                step="1"
                value="42"
                aria-describedby="team-size-description"
              >
              <div class="price-slider-ends" aria-hidden="true"><span>1</span><span>75+</span></div>
            </div>
          </div>

          <div class="price-calculator-summary" aria-live="polite">
            <div class="price-calculator-total">
              <p class="price-calculator-monthly"><span data-monthly-price>£8,000</span><span data-monthly-period> / month</span></p>
              <p class="price-calculator-contract" data-contract-price>£96,000 over 12 months</p>
            </div>
            <p class="price-calculator-term">12-month agreement</p>
            <a class="btn btn-solid btn-lg price-calculator-enquire" href="/contact#enquire">Enquire about Multideck</a>
          </div>
        </div>
      </div>
    </section>
  `,
};
