// PII masking: maskInput before Claude, redact on output.

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Spaces/tabs only (not \s): a number must not swallow the next line, e.g. a postal code line above a phone line.
const PHONE = /\+?\d[\d \t-]{8,}\d/g;
export const redact = (s) => s.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
const POSTAL = /(?:〒\s?)?\d{3}-\d{4}/g;
// A line that is only "<name>様/さん/殿/님" (the salutation of an agent mail). Company names are mid-sentence, so they stay.
const SALUTATION = /^[ \t　]*[^\s　、。,.]{1,12}?[ \t　]*(様|さん|殿|님)[ \t　]*$/gm;
// L9: applied to pasted text BEFORE it is sent to Claude. shortcut: names elsewhere in the text are not detected.
// Phones first: POSTAL's 3-4 digits also match inside a 0X0-XXXX-XXXX phone. PHONE needs 10+ chars, so a postal code never matches it.
// shortcut: a postal code and a phone on one line with only a space between become one "〒[phone]" — no digits leak; split PHONE if labels matter.
export const maskInput = (s) => redact(s).replace(POSTAL, "[〒]").replace(SALUTATION, "[氏名]$1");
