export const REQUISITION_CATALOG = Object.freeze([
  {
    id: "official-mug-12oz",
    name: "Official Triangle Agency Mug (12oz)",
    imageId: "official-mug",
    cost: 3,
    description: "A stylish ceramic mug for liquids within a reasonable temperature range.",
  },
  {
    id: "official-mug-18oz",
    name: "Official Triangle Agency Mug (18oz)",
    imageId: "official-mug",
    cost: 18,
    description: "A stylish ceramic mug for liquids within a reasonable temperature range.",
  },
  {
    id: "convenient-paperclip-rental",
    name: "Convenient Paperclip Rental",
    imageId: "convenient-paperclip",
    cost: 1,
    description: "Discreetly stores documents or digital files; Agency property terms apply.",
  },
  {
    id: "convenient-paperclip-purchase",
    name: "Convenient Paperclip Purchase",
    imageId: "convenient-paperclip",
    cost: 15,
    description: "Discreetly stores documents or digital files; Agency property terms apply.",
  },
  { id: "small-locker-rental", name: "Small Locker Rental", cost: 1, description: "A backpack-sized Side Pocket Locker." },
  { id: "large-locker-rental", name: "Large Locker Rental", cost: 3, description: "A garage-sized Side Pocket Locker." },
  { id: "small-locker-purchase", name: "Small Locker Purchase", cost: 11, description: "A backpack-sized Side Pocket Locker." },
  { id: "large-locker-purchase", name: "Large Locker Purchase", cost: 33, description: "A garage-sized Side Pocket Locker." },
  { id: "one-mission-meal-plan", name: "One-Mission Meal Plan", cost: 1, description: "Approved triangular food options for one mission." },
  { id: "permanent-meal-plan", name: "Permanent Meal Plan", cost: 15, description: "Approved triangular food options for ongoing Agency service." },
  { id: "charitable-donation", name: "Charitable Donation", cost: 9, description: "One year of funding for a randomly selected orphanage in need." },
  { id: "car-service-guest-pass", name: "Three Wheelin' Car Service Guest Pass", cost: 1, description: "Personal vehicle access for one mission." },
  { id: "car-service-lifetime-membership", name: "Three Wheelin' Car Service Lifetime Membership", cost: 15, description: "Ongoing personal vehicle access; damage may result in demerits." },
  { id: "disclosure-agreement-guest-pass", name: "Disclosure Agreement Guest Pass", cost: 1, description: "Telepathic communication agreement access for one mission." },
  { id: "disclosure-agreement-membership", name: "Disclosure Agreement Membership", cost: 15, description: "Ongoing telepathic communication agreement access." },
  { id: "official-track-jacket", name: "Official Triangle Agency Track Jacket (Any Size)", cost: 15, description: "Lightweight Agency apparel with room for promotion patches." },
  { id: "triangle-at-home-1000-gift-card", name: "Triangle at Home $1,000 Gift Card", cost: 1, description: "For commonly available mundane investigation necessities. Not for resale." },
  { id: "triangle-at-home-3000000-gift-card", name: "Triangle at Home $3,000,000 Gift Card", cost: 66, description: "For substantial commonly available mundane investigation necessities. Not for resale." },
  { id: "department-transfer-first-time", name: "Department Transfer Request — First Time", cost: 15, description: "Transfer to an unrepresented Competency after your next mission." },
  { id: "department-transfer-following", name: "Department Transfer Request — All Following Times", cost: 30, description: "Transfer to an unrepresented Competency after your next mission." },
  { id: "history-revision-request", name: "History Revision Request — All Requests", cost: 99, description: "Uses the Agency's 3% Flash Back program to rewrite a mundane moment." },
  { id: "skybreaker-helicopter-base", name: "LMZ Skybreaker Archon-Class Helicopter — Base Model", cost: 333, description: "Agency-branded helicopter with automated assistant and chilled cupholders." },
  { id: "skybreaker-helicopter-fire-resistant", name: "LMZ Skybreaker Archon-Class Helicopter — Fire Resistant", cost: 999, description: "Fire-resistant Skybreaker upgrade." },
]);

const requisitionsById = new Map(REQUISITION_CATALOG.map((item) => [item.id, item]));
const imageAssets = new Map([
  ["official-mug-12oz", "Mug.png"],
  ["official-mug-18oz", "Mug.png"],
  ["convenient-paperclip-rental", "Paper_Clip.png"],
  ["convenient-paperclip-purchase", "Paper_Clip.png"],
  ["one-mission-meal-plan", "Meal.png"],
  ["permanent-meal-plan", "Meal.png"],
  ["charitable-donation", "Charitible_Donation.png"],
  ["car-service-guest-pass", "Car.png"],
  ["car-service-lifetime-membership", "Car.png"],
  ["disclosure-agreement-guest-pass", "Disclosure Agreement.png"],
  ["disclosure-agreement-membership", "Disclosure Agreement.png"],
  ["official-track-jacket", "Jacket.png"],
  ["triangle-at-home-1000-gift-card", "Gift_Card.png"],
  ["triangle-at-home-3000000-gift-card", "Gift_Card.png"],
  ["department-transfer-first-time", "Department_Transfer.png"],
  ["department-transfer-following", "Department_Transfer.png"],
  ["history-revision-request", "History_Revision.png"],
  ["skybreaker-helicopter-base", "Helicopter.png"],
  ["skybreaker-helicopter-fire-resistant", "Helicopter.png"],
]);

export function getRequisitionItem(itemId) {
  return requisitionsById.get(itemId) ?? null;
}

export function listRequisitionItems() {
  return REQUISITION_CATALOG.map((item) => ({
    ...item,
    ...(imageAssets.has(item.id) && { imageAsset: imageAssets.get(item.id) }),
  }));
}
