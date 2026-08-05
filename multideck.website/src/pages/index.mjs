import { about } from "./about.mjs";
import { contact } from "./contact.mjs";
import { featurePages } from "./feature-pages.mjs";
import { featuresOverview } from "./features.mjs";
import { home } from "./home.mjs";
import { pricing } from "./pricing.mjs";

/* Build order is route order, which is also the order the nav presents them in. */
export const pages = [home, featuresOverview, ...featurePages, pricing, about, contact];
