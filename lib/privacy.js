// PII masking: maskInput before Claude, redact on output.

const EMAIL = /[\w.+-]+[@＠][\w-]+(\.[\w-]+)+/g;
// Spaces/tabs only (not \s): a number must not swallow the next line, e.g. a postal code line above a phone line.
const PHONE = /\+?[\d０-９][\d０-９ \t.\-－‐]{8,}[\d０-９]/g; // dots, full-width digits/hyphens too (review 11/03)
const DATE = /^(?:\d{4}[.\-/－]\d{1,2}[.\-/－]\d{1,2}|(?:19|20)\d{2}[.\-－]\d{1,2}(?:[.\-－]\d{1,2})?(?:[ \t\-－‐]+(?:19|20)\d{2}[.\-－]\d{1,2}(?:[.\-－]\d{1,2})?)+)$/; // 2019.04.01 / 2020-04-01 / 2019.04 - 2023.03: dates, not a phone
// 2026-11-05 11:00: PHONE stops at the colon and sees 「2026-11-05 11」. Only with a time right after it, so a phone never passes as this.
const DATETIME = /^(?:19|20)\d{2}[.\-](?:0?[1-9]|1[0-2])[.\-](?:0?[1-9]|[12]\d|3[01])[ \t]+(?:[01]?\d|2[0-3])$/;
// 11:00 - 2099-01-02 12:00: the first match starts at the minutes, so they are cut when a colon stands before them.
const isDate = (m, at, s) => {
  if (DATE.test(m)) return true;
  const t = m.normalize("NFKC");
  return /^[:：時]/.test(s.slice(at + m.length)) && DATETIME.test(/[:：]$/.test(s.slice(0, at)) ? t.replace(/^\d{2}[ \t]*[\-‐][ \t]*/, "") : t);
};
// 03(1234)5678: its own pattern, because parentheses in PHONE's class would swallow a date line such as "2026-11-04 (10:00)".
const PHONE_PAREN = /(?:\+?[\d０-９]+[ \t.\-－‐]?)?[(（][\d０-９]{1,5}[)）](?:[ \t.\-－‐]?[\d０-９]+)+/g;
export const redact = (s) => s.replace(EMAIL, "[email]").replace(PHONE_PAREN, (m) => (m.match(/[\d０-９]/g).length >= 9 ? "[phone]" : m)).replace(PHONE, (m, at, s) => (isDate(m, at, s) ? m : "[phone]"));
const POSTAL = /(?:〒\s?)?[\d０-９]{3}[-－][\d０-９]{4}/g;
// A line that is only "<name>様/さん/殿/님" (the salutation of an agent mail). Company names are mid-sentence, so they stay.
const SALUTATION = /^[ \t　]*[^\s　、。,.]{1,12}?(?:[ \t　][^\s　、。,.]{1,12}?)?[ \t　]*(様|さん|殿|님)[ \t　]*$/gm; // one space inside: 山田 太郎 様
// L9: applied to pasted text BEFORE it is sent to Claude. shortcut: names elsewhere in the text are not detected.
// Phones first: POSTAL's 3-4 digits also match inside a 0X0-XXXX-XXXX phone. PHONE needs 10+ chars, so a postal code never matches it.
// shortcut: a postal code and a phone on one line with only a space between become one "〒[phone]" — no digits leak; split PHONE if labels matter.
// Full-width ＠ / digits / hyphens are matched directly (review 11/03); the text itself is not normalized.
export const maskInput = (s) => redact(s).replace(POSTAL, "[〒]").replace(SALUTATION, "[氏名]$1");
