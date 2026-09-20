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

export const DEED_VERSION = "2026-09-20.4"

export const DEED_TITLE = "Confidentiality and Intellectual Property Deed"

export const TARTE_ENTITIES = [
  "Tarte Pty Ltd as trustee for the CBW Trust (ABN 35 686 638 057)",
  "Tarte Currumbin Pty Ltd (ACN 666 527 920) as trustee for the Saltwater Currumbin Trust (ABN 81 931 246 394)",
]

export interface DeedSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
  after?: string[]
}

/**
 * v3 (Chloe, 20 Sep 2026): short and neutral. Nothing that explains why the
 * information is valuable or what a competitor could do with it. Every
 * sentence left is doing legal work:
 *  - deed poll + "executed as a deed" + intention to be bound: binds without
 *    consideration, enforceable by each named beneficiary;
 *  - the "in return for" line: consideration as well, so equitable relief
 *    (injunction) is not resisted on the ground that the signer got nothing;
 *  - a defined, listed subject matter that excludes public information and
 *    general skill, so it is not read down as a disguised restraint;
 *  - the one-sentence limits clause (v4, Chloe: no bulleted list of
 *    permissions): terms gagging own pay are unlawful (Fair Work Act pay
 *    secrecy provisions) and nothing can bar regulator or whistleblower
 *    disclosures; leaving them out would put the rest at risk;
 *  - written assignment + moral rights consent for anything not already the
 *    employer's by law (contractors, out-of-hours work for Tarte);
 *  - monitoring consent; survival after exit; damages-inadequate
 *    acknowledgement for urgent injunctions; severance; Queensland law;
 *    consent to electronic signing.
 */
export const DEED_INTRO = [
  "This deed poll is given by me in favour of each of the following, and each related entity that operates a Tarte venue now or in the future (together, Tarte). Each of them may enforce it.",
]

/** Shown after the list of entities. */
export const DEED_CONSIDERATION =
  "I give this deed in return for Tarte giving me access to its systems and information, and for my engagement or continued engagement by Tarte."

export const DEED_SECTIONS: DeedSection[] = [
  {
    heading: "1. Confidential Information",
    paragraphs: [
      "Confidential Information means all information about Tarte's business that is not public and that I obtain through my work with Tarte, in any form. It includes recipes, methods, specifications, portions and menus; costings, pricing, supplier details and terms; sales, financial, customer and booking information; staff, roster and pay records; training material; systems, sign in details and records; and plans, negotiations and disputes.",
      "It does not include information that is public other than through a breach of duty, or my own general skill and experience.",
    ],
  },
  {
    heading: "2. My obligations",
    paragraphs: ["During my work with Tarte and after it ends, I must:"],
    bullets: [
      "keep Confidential Information confidential and use it only for my work with Tarte;",
      "not copy, photograph, screenshot, record, download, export, print or send it, except as my work requires;",
      "not disclose it to anyone outside Tarte, or to anyone inside Tarte who does not need it for their work;",
      "keep my sign in details to myself and not use anyone else's. Anything done under my sign in is taken to be done by me;",
      "tell an owner straight away if I become aware of any loss, or any unauthorised use or disclosure, of Confidential Information.",
    ],
  },
  {
    heading: "3. Limits",
    paragraphs: [
      "This deed does not apply to the extent the law gives me a right to make a disclosure, including about my own pay and conditions, or requires or protects one. It is not a restraint of trade.",
    ],
  },
  {
    heading: "4. Intellectual property",
    paragraphs: [
      "All intellectual property in anything I create or contribute to in the course of my work with Tarte belongs to Tarte on creation. I assign to Tarte any such rights I hold, now and in the future, and will sign anything reasonably required to confirm this. To the extent permitted by law, I consent to Tarte using, altering and publishing that work without attribution.",
    ],
  },
  {
    heading: "5. Monitoring",
    paragraphs: [
      "Tarte records and reviews the use of its systems, including sign ins, devices, pages opened and changes made, and may mark pages with my name and the time. I consent to this.",
    ],
  },
  {
    heading: "6. When my work ends",
    paragraphs: [
      "When my work with Tarte ends, or earlier on request, I must return or permanently delete all Confidential Information I hold, on any device or account, and confirm this in writing if asked. My obligations continue after my work ends for as long as the information remains confidential.",
    ],
  },
  {
    heading: "7. Breach",
    paragraphs: [
      "I acknowledge that damages may not be an adequate remedy for a breach of this deed. Tarte may seek an injunction or other urgent relief, in addition to damages or an account of profits. A breach during my work with Tarte may be serious misconduct.",
    ],
  },
  {
    heading: "8. General",
    paragraphs: [
      "This deed is governed by the law of Queensland and I submit to the courts of Queensland. Any part that is unenforceable is read down or severed and the rest continues. This deed is in addition to my other duties to Tarte under contract or at law.",
      "I agree to sign this deed electronically and to receive a copy by email. I have read and understood it and have had the opportunity to obtain advice. If I am under 18, I have had the opportunity to show it to a parent or guardian.",
    ],
  },
]

export const DEED_EXECUTION =
  "Executed as a deed poll. By typing my full legal name, drawing my signature and pressing Sign, I sign, seal and deliver this deed and intend to be bound by it from that time."

/** The exact text, flattened. Hashed at signing so the wording can be proved. */
export function deedPlainText(): string {
  const out: string[] = [DEED_TITLE, `Version ${DEED_VERSION}`, "", ...DEED_INTRO, ...TARTE_ENTITIES.map((e) => `- ${e}`), "", DEED_CONSIDERATION, ""]
  for (const s of DEED_SECTIONS) {
    out.push(s.heading, ...s.paragraphs)
    for (const b of s.bullets ?? []) out.push(`- ${b}`)
    out.push(...(s.after ?? []), "")
  }
  out.push(DEED_EXECUTION)
  return out.join("\n")
}
