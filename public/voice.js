// Voice (UIUX-SPEC §9). 🔊 reads a model script: ONE /api/tts call per script (Gemini free tier ≈ 3 TTS requests/min),
// raw PCM streamed into Web Audio, with a read-along highlight. 🎤 records an answer and puts the /api/stt transcript
// into the answer box; it is never sent automatically (recognition errors would go straight into the review).
import { $, el, iel, icon, state, T, message, still, targetOf, bubble } from "./render.js";
import { highlightLength, totalSeconds, fromBoundary } from "./tts-timing.js";
import { compareReading } from "./readcheck.js";

let opts = { code: () => null, pack: () => "jp" }; // set by app.js (the verified code lives only in app.js memory)
const VOICE_KEY = "mensetsu-tts-voice", SPEED_KEY = "mensetsu-tts-speed";
const stored = (k, allowed, d) => { try { const v = localStorage.getItem(k); return allowed.includes(v) ? v : d; } catch { return d; } };
const voiceOf = () => stored(VOICE_KEY, ["Kore", "Charon"], "Kore");
const speedOf = () => Number(stored(SPEED_KEY, ["0.8", "1", "1.2"], "1"));

// ---- 🔊 model script ----
let current = null; // { btn, stop() } of the script being read
let audio = null; // one AudioContext for the page
// shortcut: memory for this page only (a few scripts × ~6 MB at most); replays skip the network and the quota.
const pcmCache = new Map(); // `${voice}|${text}` → { chunks: Uint8Array[], rate }
// Device fallback: only voices that passed the listening test (TTS-VOICE-EVAL §1-4); never "any ja-JP voice".
// shortcut: the ko names (macOS Yuna, Chrome desktop) were not listened to; add others after a listening test.
const DEVICE_VOICES = { ja: ["Kyoko", "Google 日本語"], ko: ["Yuna", "Google 한국의"] };

function setListen(btn, on) {
  const label = on ? T().tts.stop : T().tts.play;
  btn.setAttribute("aria-pressed", String(on));
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.replaceChildren(icon(on ? "stop" : "speaker"));
}

// Live scripts read with Gemini; in the demo/tutorial the same button reads with the device voice (0 AI calls).
export function addListen(card, text, sig) {
  if (!text) return;
  const btn = el("button", "listen");
  btn.type = "button";
  setListen(btn, false);
  btn.addEventListener("click", () => (current?.btn === btn ? stopTts() : play(btn, card, text, sig)));
  card.prepend(btn);
}

export function stopTts() {
  current?.stop();
}

// Highlight = <span class="read"> prefix + the rest as a text node; textContent of the paragraph never changes.
function highlighter(p, text) {
  const read = el("span", "read"), rest = document.createTextNode(text);
  const ends = [...text.matchAll(/[。！？!?]/g)].map((m) => m.index + 1);
  p.replaceChildren(read, rest);
  p.classList.add("along"); // unread part at normal weight, so the bold read part stands out
  p.setAttribute("aria-live", "off"); // the chat log is a live region: per-frame updates must not be announced
  let shown = -1;
  return {
    set(n) {
      if (still() && n > 0) n = ends.find((e) => e >= n) ?? text.length; // reduced motion: whole sentences
      if (n === shown) return;
      shown = n;
      read.textContent = text.slice(0, n);
      rest.data = text.slice(n);
    },
    done() {
      p.replaceChildren(text);
      p.classList.remove("along");
      p.removeAttribute("aria-live");
    },
  };
}

function note(card, text) {
  card.querySelector(".tts-note")?.remove();
  card.append(el("p", "tts-note legend", text));
}

function play(btn, card, text, sig) {
  stopTts();
  const AC = window.AudioContext || window.webkitAudioContext;
  // Created and resumed inside the tap, before any await: autoplay rules need the user gesture.
  if (AC) audio ??= new AC();
  audio?.resume();
  const hl = highlighter(card.querySelector(".ja"), text);
  const cleanups = [];
  const me = {
    btn,
    stopped: false,
    stop() {
      if (me.stopped) return;
      me.stopped = true;
      for (const f of cleanups) try { f(); } catch {}
      hl.done();
      btn.classList.remove("loading");
      setListen(btn, false);
      if (current === me) current = null;
    },
  };
  current = me;
  setListen(btn, true);
  card.querySelector(".tts-note")?.remove();
  // No signature (demo/tutorial, a session saved before 11/03) → straight to the device voice.
  (state.demoActive || !sig ? Promise.reject(new Error("device voice")) : playCloud(me, hl, text, cleanups, sig)).catch(() => { if (!me.stopped) return playDevice(me, hl, card, text, cleanups); }).catch(() => me.stop());
}

// Web Audio playbackRate changes pitch with speed (0.8× lower, 1.2× higher). Chosen over <audio>+preservesPitch, which
// needs the whole file first (no streaming start) and a blob: media CSP; the ⚙ hint says so.
async function playCloud(me, hl, text, cleanups, sig) {
  if (!audio) throw new Error("no Web Audio");
  const voice = voiceOf(), speed = speedOf(), key = `${voice}|${text}`;
  let source = pcmCache.get(key), rate = source?.rate, keep = null;
  if (!source) {
    me.btn.classList.add("loading");
    const ctl = new AbortController();
    cleanups.push(() => ctl.abort());
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-code": opts.code() ?? "" },
      body: JSON.stringify({ text, voice, pack: opts.pack(), sig }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error("tts failed");
    rate = Number(res.headers.get("x-sample-rate")) || 24000;
    const reader = res.body.getReader();
    keep = [];
    source = { chunks: (async function* () { for (let x; !(x = await reader.read()).done; ) yield x.value; })() };
  }
  if (me.stopped) return;

  const sources = [], segs = []; // segs: { t: context start time, orig: script seconds before it, dur }
  cleanups.push(() => sources.forEach((s) => s.stop()));
  let at = 0, arrived = 0, bytes = 0, done = false, carry = null, raf = 0;
  cleanups.push(() => cancelAnimationFrame(raf));
  const elapsed = () => {
    const now = audio.currentTime, s = segs.findLast((x) => x.t <= now);
    return s ? s.orig + Math.min((now - s.t) * speed, s.dur) : 0;
  };
  const tick = () => {
    if (me.stopped) return;
    if (done && audio.currentTime >= at) return me.stop(); // finished: back to the plain card
    const n = highlightLength(text, elapsed(), totalSeconds({ text, bytes, rate, done }));
    hl.set(done ? n : Math.min(n, text.length - 1)); // caught up with a slow stream: never "all read" before the end
    raf = requestAnimationFrame(tick);
  };
  const schedule = (u8) => {
    let b = u8;
    if (carry) (b = new Uint8Array(carry.length + u8.length)).set(carry), b.set(u8, carry.length);
    carry = b.length & 1 ? b.slice(-1) : null; // a chunk can end mid-sample
    const n = b.length >> 1;
    if (!n) return;
    const dv = new DataView(b.buffer, b.byteOffset, n * 2), f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = dv.getInt16(i * 2, true) / 32768;
    const buf = audio.createBuffer(1, n, rate);
    buf.copyToChannel(f, 0);
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = speed;
    src.connect(audio.destination);
    const t = Math.max(at, audio.currentTime + 0.05);
    src.start(t);
    sources.push(src);
    segs.push({ t, orig: arrived, dur: n / rate });
    arrived += n / rate;
    at = t + n / rate / speed;
  };
  let started = false;
  try {
    for await (const chunk of source.chunks) {
      if (me.stopped) return;
      keep?.push(chunk);
      bytes += chunk.length;
      schedule(chunk);
      if (!started) {
        started = true;
        me.btn.classList.remove("loading");
        raf = requestAnimationFrame(tick);
      }
    }
  } catch (e) {
    if (me.stopped) return;
    if (!started) throw e; // nothing played yet → device voice
    return me.stop(); // broke mid-script: stop rather than read the rest in another voice
  }
  if (!started) throw new Error("no audio");
  done = true;
  if (keep) pcmCache.set(key, { chunks: keep, rate });
}

async function deviceVoice() {
  const ss = window.speechSynthesis;
  if (!ss || !window.SpeechSynthesisUtterance) return null;
  if (!ss.getVoices().length) await new Promise((ok) => { ss.addEventListener("voiceschanged", ok, { once: true }); setTimeout(ok, 1000); });
  const all = ss.getVoices();
  for (const name of DEVICE_VOICES[targetOf()] ?? []) {
    const v = all.find((x) => x.name === name);
    if (v) return v;
  }
  return null;
}

// One utterance per sentence: Google 日本語 cuts long utterances (~15 s). Boundary charIndex is per utterance.
async function playDevice(me, hl, card, text, cleanups) {
  me.btn.classList.remove("loading");
  const voice = await deviceVoice();
  if (me.stopped) return;
  note(card, voice ? T().tts.device : T().tts.noVoice);
  if (!voice) return me.stop();
  const ss = window.speechSynthesis;
  cleanups.push(() => ss.cancel());
  let off = 0, n = 0;
  for (const part of text.split(/(?<=[。！？!?])/)) {
    await new Promise((done) => {
      const u = new SpeechSynthesisUtterance(part);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = speedOf(); // speechSynthesis keeps the pitch
      u.onboundary = (e) => { n = fromBoundary(n, { charIndex: off + e.charIndex, charLength: e.charLength }); hl.set(n); };
      u.onend = u.onerror = done;
      ss.speak(u);
    });
    if (me.stopped) return;
    off += part.length;
    hl.set((n = Math.max(n, off)));
  }
  me.stop();
}

// ---- 🎤 answer / read-aloud recording ----
const mic = $("mic"), status = $("micStatus"), freeNote = $("micNote"), input = $("input"), send = $("send");
const MAX_REC_S = 90;
let recording = false; // /api/access says whether STT is allowed (off on the Gemini free tier, decision 11/03)
export const allowRecording = (on) => { recording = on === true; };
let rec = null; // { recorder, stream, timer, t0, cancelled, ui }: one recording at a time, answer or read-aloud
let warned = false; // free-tier line (decision 11/03): first recording of this page session only
const micSupported = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

// recording = the timer line, which carries the record icon. Same text → untouched, so the live region is not re-announced.
function sayIn(line, text, recording = false) {
  if (line.textContent !== text) line.replaceChildren(...(recording ? [icon("record")] : []), text);
  line.hidden = !text;
}
const say = (text, recording) => sayIn(status, text, recording);
function setMic(on) {
  const label = on ? T().mic.stop : T().mic.start;
  mic.setAttribute("aria-pressed", String(on));
  mic.setAttribute("aria-label", label);
  mic.title = label;
  mic.replaceChildren(icon(on ? "stop" : "mic"));
  mic.classList.toggle("rec", on);
  status.classList.toggle("rec", on);
}
const answerUi = { set: setMic, say, off: (on) => mic.classList.toggle("off", on) };

// ui: { set(recording), say(text, recording), off?(dim) }; done(blob, durationMs) runs unless the recording was cancelled.
async function startRec(ui, done) {
  stopRec(true); // starting one recording cancels the other
  if (!micSupported()) return ui.say(T().mic.unsupported);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    ui.off?.(true);
    return ui.say(e?.name === "NotAllowedError" || e?.name === "SecurityError" ? T().mic.denied : T().mic.unsupported);
  }
  ui.off?.(false);
  const type = ["audio/webm;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : {});
  const parts = [];
  const me = (rec = { recorder, stream, t0: Date.now(), cancelled: false, ui });
  recorder.ondataavailable = (e) => { if (e.data?.size) parts.push(e.data); };
  recorder.onstop = () => {
    clearInterval(me.timer);
    for (const t of stream.getTracks()) t.stop();
    if (!me.cancelled) done(new Blob(parts, { type: recorder.mimeType || type || "audio/webm" }), Date.now() - me.t0);
  };
  recorder.start();
  ui.set(true);
  if (!warned) {
    warned = true;
    freeNote.textContent = T().mic.freeTier;
    freeNote.hidden = false;
  }
  const tick = () => {
    const s = Math.floor((Date.now() - me.t0) / 1000);
    ui.say(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, true);
    if (s >= MAX_REC_S) stopRec();
  };
  tick();
  me.timer = setInterval(tick, 250);
}
function stopRec(cancel = false) {
  if (!rec) return;
  const r = rec;
  rec = null;
  r.cancelled = cancel;
  r.ui.set(false);
  if (cancel) r.ui.say("");
  r.recorder.stop();
}

// x-duration-ms lets the server judge "most of the recording was not recognised" (api/stt.js speechQuality).
const postStt = (blob, ms, extra = {}) => fetch(`/api/stt?${new URLSearchParams({ pack: opts.pack(), lang: state.lang, ...extra })}`, {
  method: "POST",
  headers: { "content-type": blob.type || "audio/webm", "x-access-code": opts.code() ?? "", "x-duration-ms": String(Math.round(ms)) },
  body: blob,
});

async function transcribe(blob, ms) {
  mic.disabled = true;
  say(T().mic.transcribing);
  const my = state.epoch;
  try {
    const res = await postStt(blob, ms);
    const data = await res.json().catch(() => ({ code: "generation_failed" }));
    if (my !== state.epoch) return;
    if (!res.ok) return say(message(data));
    if (data.quality === "low") return askAgain(); // V3: a bad transcript never goes into the answer box
    if (!data.text) return say(message({ code: "generation_failed" }));
    const typed = input.value.replace(/\s+$/, "");
    input.value = typed ? `${typed}\n${data.text}` : data.text;
    input.focus();
    send.classList.add("ready");
    say(T().mic.hint);
  } catch {
    say(message({ code: "network" }));
  } finally {
    mic.disabled = false;
  }
}

function askAgain() {
  say("");
  const b = bubble("coach", T().mic.lowQuality);
  const btn = iel("button", "inline-btn", "mic", T().mic.retry);
  btn.type = "button";
  btn.addEventListener("click", () => { if (!mic.hidden && !rec) startRec(answerUi, transcribe); }); // answer stage only
  b.append("\n", btn);
}

// ---- V4: read the model script aloud → recognition-based check against its hiragana reading (readcheck.js) ----
// Live scripts with a kana reading only: none for a same-language screen (jp + ja), the kr pack, or the demo/tutorial.
export function addReadAloud(card, script) {
  if (!recording || state.demoActive || !script?.kana) return;
  const t = T().read;
  const btn = el("button", "readaloud"), line = el("p", "read-status legend");
  btn.type = "button";
  line.setAttribute("aria-live", "polite");
  line.hidden = true;
  const ui = {
    set(on) {
      const label = on ? T().mic.stop : t.start;
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.replaceChildren(icon(on ? "stop" : "mic"));
      btn.classList.toggle("rec", on);
    },
    say: (text, recording) => sayIn(line, text, recording),
  };
  ui.set(false);
  const start = () => { stopTts(); startRec(ui, (blob, ms) => checkReading(card, script, ui, line, blob, ms)); };
  btn.addEventListener("click", () => (rec?.ui === ui ? stopRec() : start()));
  ui.start = start;
  const listen = card.querySelector(".listen");
  if (listen) listen.after(btn); // floats just left of the speaker
  else card.prepend(btn);
  card.querySelector(".ja").after(line);
}

async function checkReading(card, script, ui, line, blob, ms) {
  const my = state.epoch;
  card.querySelector(".read-result")?.remove();
  ui.say(T().read.checking);
  try {
    const res = await postStt(blob, ms, { kana: "1" });
    const data = await res.json().catch(() => ({ code: "generation_failed" }));
    if (my !== state.epoch) return;
    ui.say("");
    if (!res.ok) return ui.say(message(data));
    line.after(readResult(card, script, ui, data));
  } catch {
    ui.say(message({ code: "network" }));
  }
}

function readResult(card, script, ui, data) {
  const t = T().read, p = card.querySelector(".ja"), out = el("div", "read-result");
  p.replaceChildren(script.text); // earlier underlines go
  const again = () => { const b = iel("button", "inline-btn", "mic", t.again); b.type = "button"; b.addEventListener("click", ui.start); return b; };
  if (!data.kana || data.quality === "low") out.append(el("p", null, t.retry), again());
  else {
    const r = compareReading(script.kana, data.kana), pct = Math.round(r.ratio * 100);
    if (r.ok) out.append(iel("p", "read-ok", "check", t.ok({ pct }))); // details only when not ok: otherwise recogniser noise
    else {
      out.append(iel("p", "read-miss", "x", t.miss({ pct })));
      // span.sentence counts 。！？ in the kana; the script text is cut the same way (same regex as playDevice).
      const sentences = script.text.split(/(?<=[。！？!?])/), bad = new Set(r.spans.map((x) => x.sentence));
      p.replaceChildren(...sentences.map((x, i) => (bad.has(i) ? el("span", "miss", x) : x)));
      // Biggest slips first; spans with nothing expected are extra words (fillers), not pronunciation errors.
      for (const x of r.spans.filter((x) => x.expected).sort((a, b) => b.expected.length - a.expected.length).slice(0, 3)) {
        const row = el("p", "read-diff", t.diff({ heard: x.heard || t.none, expected: x.expected }));
        const play = iel("button", "inline-btn", "speaker", t.listen);
        play.type = "button";
        play.addEventListener("click", () => speakSentence(card, sentences[x.sentence] ?? script.text));
        row.append(" ", play);
        out.append(row);
      }
      out.append(again());
    }
  }
  out.append(el("p", "legend", t.note));
  return out;
}

// shortcut: one sentence through the device voice only (the cached cloud audio is the whole script; slicing it needs
// sentence timings), so it costs no TTS request; upgrade by slicing pcmCache with tts-timing if device voices are missing.
async function speakSentence(card, text) {
  stopTts();
  const voice = await deviceVoice();
  if (!voice) return note(card, T().tts.noVoice);
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = speedOf();
  window.speechSynthesis.speak(u);
}

// Visible only at the answer stage. Leaving it stops a recording without sending it.
export function showMic(on) {
  if (!on && rec?.ui === answerUi) stopRec(true); // a read-aloud check on the script card keeps going
  mic.hidden = !(on && recording);
  setMic(rec?.ui === answerUi);
  mic.classList.toggle("off", !micSupported());
}
// The answer was sent: the check-before-sending hint and the Send highlight have done their job.
export function voiceSent() {
  say("");
  freeNote.hidden = true;
  send.classList.remove("ready");
}
export function stopVoice() {
  stopTts();
  stopRec(true);
  voiceSent();
}

export function initVoice(o) {
  opts = o;
  mic.addEventListener("click", () => (rec?.ui === answerUi ? stopRec() : startRec(answerUi, transcribe)));
  const speed = $("ttsSpeed"), radios = document.querySelectorAll("input[name=ttsVoice]");
  $("opts").addEventListener("click", () => {
    for (const r of radios) r.checked = r.value === voiceOf();
    speed.value = String(speedOf());
  });
  for (const r of radios) r.addEventListener("change", () => { try { localStorage.setItem(VOICE_KEY, r.value); } catch {} });
  speed.addEventListener("change", () => { try { localStorage.setItem(SPEED_KEY, speed.value); } catch {} });
}
