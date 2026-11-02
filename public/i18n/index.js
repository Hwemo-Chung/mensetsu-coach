// Screen languages. Adding one: create public/i18n/<code>.js with the same keys as ko.js, add one line here,
// and register the same code in EXPLAIN_LANGS (lib/coach.js). test/i18n.test.js checks both.
import ko from "./ko.js";
import en from "./en.js";
import ja from "./ja.js";

export const LANGS = { ko, en, ja };
