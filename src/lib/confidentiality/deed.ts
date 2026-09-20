/**
 * Confidentiality and Intellectual Property Deed. The wording staff sign
 * before they can open anything in Tarte Kitchen.
 *
 * VERSIONED: change the text, bump DEED_VERSION, and everyone is asked to
 * sign again at their next login. The signed record stores the version and
 * a SHA-256 of the exact text shown, so what was agreed can always be proved.
 *
 * Drafting choices (Chloe, 20 Sep 2026, no lawyer review by her decision):
 *  - A deed poll, so it binds existing staff without fresh consideration.
 *  - Specific about what is confidential, and NOT a restraint of trade, so
 *    it is the kind of document a court enforces rather than reads down.
 *  - Carves out what cannot lawfully be gagged: own pay and conditions
 *    (Fair Work Act pay secrecy provisions), regulators, legal advice.
 *  - Monitoring consent, so access logging and owner-only alerts are fair.
 */

export const DEED_VERSION = "2026-09-20.2"

export const DEED_TITLE = "Confidentiality and Intellectual Property Deed"

export const TARTE_ENTITIES = [
  "Tarte Pty Ltd as trustee for the CBW Trust (ABN 35 686 638 057), trading as Tarte Bakery, Burleigh Heads",
  "Tarte Currumbin Pty Ltd (ACN 666 527 920) as trustee for the Saltwater Currumbin Trust (ABN 81 931 246 394), trading as Tarte Beach House and Tarte Tea Garden, Currumbin",
]

export interface DeedSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
  after?: string[]
}

export const DEED_INTRO = [
  "This is a deed poll. I give it for the benefit of each Tarte business listed below, and any related business that operates a Tarte venue now or in the future (together, Tarte). Each of them can enforce it against me.",
  "I am signing because Tarte gives me access to information, systems and methods that took years and a great deal of money to build, and which would let a competitor copy Tarte if they got out.",
]

export const DEED_SECTIONS: DeedSection[] = [
  {
    heading: "1. What is confidential",
    paragraphs: [
      "Confidential Information means everything I see, hear or am given through my work at Tarte that is not public, in any form, including anything in Tarte Kitchen, Tarte Shifts, the tills, shared drives, group chats, emails and on paper. In particular:",
    ],
    bullets: [
      "Recipes, prep cards, methods, portion sizes and weights, plating guides, menu specifications and anything still in development.",
      "Costings, food cost and wage percentages, prices paid to suppliers, supplier names, terms, quotes and order volumes.",
      "Sales figures, best sellers, customer and booking information, budgets, targets, reports and anything discussed at management meetings.",
      "Rosters, other people's pay and personal details, staff records and training material, including the staff handbooks.",
      "How Tarte's systems work, including checklists, ordering, maintenance, food safety records, logins and passwords.",
      "Tarte's plans: new venues, new products, negotiations, leases, disputes and anything I am told is private.",
    ],
    after: [
      "Information stops being confidential only if it becomes public without anyone breaking an obligation to Tarte.",
    ],
  },
  {
    heading: "2. What I promise",
    paragraphs: ["While I work at Tarte and after I leave, I will:"],
    bullets: [
      "Keep Confidential Information secret and use it only to do my job at Tarte.",
      "Not copy, photograph, screenshot, screen record, download, export, print, forward or send Confidential Information to myself or anyone else, unless my job needs it and a manager or owner has said yes.",
      "Not show, give or describe Confidential Information to anyone outside Tarte, including other hospitality businesses, suppliers, journalists, friends and family, or on social media.",
      "Only share it inside Tarte with people who need it for their own job.",
      "Keep my name and PIN to myself. I will not let anyone use my login and I will not use anyone else's. Anything done under my login is treated as done by me.",
      "Tell an owner straight away if I think Confidential Information has been lost, copied or shared, or if I see someone else doing it.",
    ],
  },
  {
    heading: "3. What this does not stop",
    paragraphs: ["Nothing in this deed stops me from:"],
    bullets: [
      "Talking about my own pay, hours and conditions, or asking other people about theirs.",
      "Making a report or complaint to, or answering questions from, a regulator or authority, such as the Fair Work Ombudsman, a food safety or workplace health and safety regulator, the ATO or the police.",
      "Getting advice from a lawyer, union or accountant, or disclosing something the law requires me to disclose.",
      "Making a disclosure that is protected by whistleblower laws.",
      "Working somewhere else in hospitality after Tarte, using the general skills and experience I have built up. This deed is not a restraint of trade. It protects Tarte's information, not my ability to earn a living.",
    ],
  },
  {
    heading: "4. What I create belongs to Tarte",
    paragraphs: [
      "Anything I create or contribute to in the course of my work at Tarte belongs to Tarte from the moment it is created. That includes recipes, methods, menus, photos, videos, written content, designs, documents, processes and improvements to any of them. To the extent the law needs an assignment, I assign those rights to Tarte by signing this deed, and I will sign anything reasonably needed to confirm it.",
      "As far as the law allows, I consent to Tarte using, changing and publishing that work without naming me.",
    ],
  },
  {
    heading: "5. Tarte monitors its systems",
    paragraphs: [
      "I understand and agree that Tarte records and reviews how its systems are used. That includes who signed in, when, from which device, which pages were opened and what was entered or changed. Pages may be marked with my name and the time so that any copy can be traced to me. Tarte can review these records at any time without telling me first.",
    ],
  },
  {
    heading: "6. When I leave",
    paragraphs: [
      "When my work at Tarte ends, or earlier if I am asked, I will return or permanently delete all Confidential Information I hold, including anything on my own phone, email or cloud storage, and confirm in writing that I have done so if asked. My access ends on my last day. My promises in this deed continue after I leave, for as long as the information stays confidential.",
    ],
  },
  {
    heading: "7. If I break this deed",
    paragraphs: [
      "I understand that a breach could cause Tarte serious harm that money alone would not fix. Tarte may go to court for an urgent order to stop me, as well as claiming its losses or any profit made from the breach. While I work at Tarte, a breach may also be treated as serious misconduct.",
    ],
  },
  {
    heading: "8. General",
    paragraphs: [
      "This deed is governed by the law of Queensland. If any part of it cannot be enforced, that part is read down or removed and the rest still applies. It adds to, and does not replace, any confidentiality duties in my employment contract or under the general law.",
      "I agree to sign this deed electronically and to receive a copy by email. If I am under 18, I have had the chance to show this deed to a parent or guardian before signing it.",
      "I have read this deed, I have had the chance to ask questions and get advice, and I understand it.",
    ],
  },
]

export const DEED_EXECUTION =
  "Executed as a deed poll. By typing my full legal name, drawing my signature and pressing Sign, I sign, seal and deliver this deed and intend to be bound by it immediately."

/** The exact text, flattened. Hashed at signing so the wording can be proved. */
export function deedPlainText(): string {
  const out: string[] = [DEED_TITLE, `Version ${DEED_VERSION}`, "", ...DEED_INTRO, "", "Tarte businesses:", ...TARTE_ENTITIES.map((e) => `- ${e}`), ""]
  for (const s of DEED_SECTIONS) {
    out.push(s.heading, ...s.paragraphs)
    for (const b of s.bullets ?? []) out.push(`- ${b}`)
    out.push(...(s.after ?? []), "")
  }
  out.push(DEED_EXECUTION)
  return out.join("\n")
}
