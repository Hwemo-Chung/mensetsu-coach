// JP regression guard: the full request (model, params, system prompt, messages, schema) each builder sends to Claude
// must stay byte-identical while other packs/languages are added. UPDATE_SNAPSHOTS=1 npm test rewrites the files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loadPack, buildQuestionRequest, buildScriptRequest, buildReviewRequest, buildReverseRequest, maskInput } from "../lib/coach.js";

// Fixed synthetic inputs, masked the way api/*.js masks them (maskInput is pure, so the masked text is deterministic).
const MAIL = maskInput(`件名：【面接日程のご案内】株式会社サンプル（仮） バックエンドエンジニア

〇〇様

株式会社サンプル（仮）様より書類選考通過のご連絡をいただきました。
・物流向け在庫管理SaaS（従業員80名）
・募集: バックエンドエンジニア（Go / AWS）、チーム5名
連絡先: agent@example.com / 090-0000-0000 / 〒100-0001`);
const PROFILE = [{ type: "text", text: maskInput("経歴: 物流システムの開発7年。連絡先 me@example.com") }];
const QUESTION = "これまでの経験で、最も成果を出したプロジェクトを教えてください。";
const ANSWER = maskInput("えーと、在庫システムの刷新で、ちゃんと処理時間を半分にしました。連絡先 me@example.com");
const CONTEXT = maskInput("物流向け在庫管理SaaS。バックエンドエンジニア（Go / AWS）");
const COMPANY = { company: "株式会社サンプル（仮）", position: "バックエンドエンジニア", facts: ["物流向け在庫管理SaaS", "チーム5名"] };

const pack = loadPack("jp");
const update = process.env.UPDATE_SNAPSHOTS === "1";

for (const lang of ["ko", "en", "ja"]) {
  test(`jp/${lang} request snapshot`, () => {
    // JSON round trip = exactly what the SDK serializes; drops nothing because requests hold no functions.
    const actual = JSON.parse(JSON.stringify({
      questions: buildQuestionRequest(pack, MAIL, [], lang),
      questions_with_profile: buildQuestionRequest(pack, MAIL, PROFILE, lang),
      script: buildScriptRequest(pack, { question: QUESTION, answer: ANSWER, context: CONTEXT, lang }),
      review: buildReviewRequest(pack, { question: QUESTION, answer: ANSWER, lang }),
      reverse: buildReverseRequest(pack, { context: COMPANY, lang }),
    }));
    const file = new URL(`./snapshots/jp-${lang}.json`, import.meta.url);
    if (update) {
      mkdirSync(new URL("./snapshots/", import.meta.url), { recursive: true });
      writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
    }
    assert.deepEqual(actual, JSON.parse(readFileSync(file, "utf8")), `jp/${lang} request changed; if intended, rerun with UPDATE_SNAPSHOTS=1 and review the diff`);
  });
}
