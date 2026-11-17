/**
 * Proof rule (pure, unit-tested): an investor counts for a deal only if the proof page names it
 * as a proper noun (case-sensitive, word-bounded) in the same sentence as funding language,
 * and that sentence is not about an earlier round.
 */
export const FUND_VERB =
  /\b(led|lead|leads|co-led|leading|participat\w*|backed|backing|invested|investors?|investment|joined|funding from|funded by|raised from|financed|financing|support from|syndicate|backers?|capital from)\b/i;
export const PRIOR = /\b(previous(ly)?|earlier|prior|first backed|founded in|total of|pre-seed led by|seed led by earlier)\b/i;
export const FIRM_SUFFIX = /\b(capital|ventures?|partners?|vc|funds?|management|group|llc|inc|ltd|lp|investments?|holdings)\b/gi;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The sentence (or newline-bounded line) containing text[index..index+len], capped to 420 chars. */
function sentenceAround(text: string, index: number, len: number): string {
  let a = index;
  while (a > 0 && index - a < 260 && !/[.!?\n]\s/.test(text.slice(a - 1, a + 1)) && text[a - 1] !== "\n") a--;
  let b = index + len;
  while (b < text.length && b - index < 260 && !/[.!?]\s/.test(text.slice(b, b + 2)) && text[b] !== "\n") b++;
  return text.slice(a, b + 1).replace(/\s+/g, " ").trim();
}

export function investorEvidence(text: string, name: string): string | null {
  const core = name.replace(FIRM_SUFFIX, " ").replace(/\s+/g, " ").trim();
  const variants = [...new Set([name.trim(), core])].filter((v) => v.length >= 3);
  for (const v of variants) {
    const re = new RegExp(`(?<![\\w])${esc(v)}(?![\\w])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const sentence = sentenceAround(text, m.index, v.length);
      const local = text.slice(Math.max(0, m.index - 100), m.index + 60);
      if (FUND_VERB.test(sentence) && !PRIOR.test(local)) {
        // give the reader a little more context than the sentence alone
        return text.slice(Math.max(0, m.index - 200), m.index + v.length + 160).replace(/\s+/g, " ").trim();
      }
    }
  }
  return null;
}
