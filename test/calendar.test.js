// Google Calendar prefilled link and the practice record (DECISIONS 11/06). No server, no OAuth; every name here is invented.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarLink } from "../public/calendar.js";
import { practiceTime, sessionToMarkdown, prepToMarkdown } from "../public/export.js";
import { LANGS } from "../public/i18n/index.js";

const ko = LANGS.ko, ja = LANGS.ja;
const BASE = "https://calendar.google.com/calendar/r/eventedit?action=TEMPLATE&dates=";

test("calendar: Japan time (UTC+9) becomes UTC, also across midnight and the year end", () => {
  assert.equal(calendarLink("2026-12-01T05:00", 30, "x"), `${BASE}20261130T200000Z%2F20261130T203000Z&stz=Asia/Tokyo&etz=Asia/Tokyo&text=x`);
  assert.match(calendarLink("2026-12-01T08:30", 60, "x"), /dates=20261130T233000Z%2F20261201T003000Z&/, "the end passes UTC midnight");
  assert.match(calendarLink("2026-12-31T23:30", 60, "x"), /dates=20261231T143000Z%2F20261231T153000Z&/, "past midnight in Japan");
  assert.match(calendarLink("2027-01-01T03:00", 30, "x"), /dates=20261231T180000Z%2F20261231T183000Z&/, "back into last year in UTC");
  assert.match(calendarLink("2028-02-29T10:00", 30, "x"), /dates=20280229T010000Z/, "a leap day is a real day");
});

test("calendar: a date that does not exist, a wrong shape or a bad duration gives no link", () => {
  for (const bad of ["", "2026-02-30T10:00", "2027-02-29T10:00", "2026-13-01T10:00", "2026-12-01T24:00", "2026-12-01T10:60", "2026-12-01 10:00", "2026-12-01T10:00Z", "２０２６-12-01T10:00", null, undefined, 20261201]) assert.equal(calendarLink(bad, 30, "x"), null, String(bad));
  for (const m of [0, -30, 1.5, NaN, "30", 1441]) assert.equal(calendarLink("2026-12-01T10:00", m, "x"), null, String(m));
  assert.ok(calendarLink("2026-12-01T10:00", 1440, "x"));
});

test("calendar: the title is encoded and is the only text sent", () => {
  const title = "面接の練習（質問 3 問） & #1?";
  const url = calendarLink("2026-12-01T10:00", 30, title);
  assert.ok(url.endsWith(`&text=${encodeURIComponent(title)}`));
  const u = new URL(url);
  assert.deepEqual([...u.searchParams.keys()], ["action", "dates", "stz", "etz", "text"]);
  assert.equal(u.searchParams.get("text"), title);
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/r/eventedit");
});

test("calendar titles: no company, the count of questions not yet reviewed, none when there is no count", () => {
  assert.equal(ja.calendar.titles.practice({ n: 7 }), "面接の練習（質問 7 問）");
  assert.equal(ja.calendar.titles.practice({ n: 0 }), "面接の練習");
  for (const L of Object.values(LANGS)) for (const k of ["practice", "interview"]) assert.doesNotMatch(L.calendar.titles[k]({ n: 3 }), /undefined|\{/, k);
  assert.equal(ja.calendar.note, "押すと Google に題名と日時だけを送ります。もう一度保存すると予定が増えます。");
});

const SESSION = {
  company_context: { company: "サンプルテック", position: "PM", facts: [] },
  questions: [{ id: "q1", question: "架空の質問ですか。", stage: "一次面接", category: "技術", basis: "メール" }],
  attempts: [{ question_id: "q1", answer: "一回目の答えです。", review: null, script: null, at: "2026-11-06T05:07:30.000Z" }, { question_id: "q1", answer: "時刻のない古い答えです。", review: null, script: null }],
  notes: {},
};

test("practice record: Japan time to the minute; an older attempt without a time keeps its place and count", () => {
  assert.equal(practiceTime("2026-11-06T05:07:30.000Z"), "2026-11-06 14:07 UTC+9");
  assert.equal(practiceTime("2026-11-06T15:30:00.000Z"), "2026-11-07 00:30 UTC+9", "the next day in Japan");
  for (const bad of [undefined, null, "", "garbage"]) assert.equal(practiceTime(bad), "", String(bad));
  const md = sessionToMarkdown(SESSION, ko);
  assert.ok(md.includes(`## ${ko.export.practice} 1: Q1 (2026-11-06 14:07 UTC+9)\n`), "the time survives the phone mask");
  assert.ok(md.includes(`## ${ko.export.practice} 2: Q1\n`));
});

test("prep Markdown: the stage is named; a document from before stages reads as first", () => {
  const doc = { company: "サンプルテック", position: "PM", stage: "executive", sections: [], unresolved: [], failed: [] };
  assert.ok(prepToMarkdown(doc, ja).includes(`${ja.prep.stage}: ${ja.prep.stageNames.executive}`));
  const { stage, ...old } = doc;
  assert.ok(prepToMarkdown(old, ko).includes(`${ko.prep.stage}: ${ko.prep.stageNames.first}`));
});
