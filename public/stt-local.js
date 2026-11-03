// Answer 🎤 recognised in this browser: decode the recording to 16 kHz mono here (Web Audio is not available in
// workers), transcribe in stt-worker.js. The model (~260 MB) downloads once from huggingface.co and stays cached.
// MOCK_CLAUDE: dev.js serves test/fixtures/stt-local.mock.js at this path instead.
import { RATE } from "./stt-whisper.js";

let worker = null, seq = 0, onProgress = null;
const pending = new Map(); // id → { resolve, reject }

function get() {
  if (worker) return worker;
  worker = new Worker("/stt-worker.js", { type: "module" });
  worker.onmessage = ({ data }) => {
    if (data.progress != null) return onProgress?.(data.progress);
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    if (data.error) p.reject(new Error("stt"));
    else p.resolve(data.text);
  };
  worker.onerror = () => { // the worker script itself failed (e.g. out of memory): start a fresh one next time
    for (const p of pending.values()) p.reject(new Error("stt"));
    pending.clear();
    worker.terminate();
    worker = null;
  };
  return worker;
}

export const supported = () => typeof Worker === "function" && typeof WebAssembly === "object" && typeof OfflineAudioContext === "function";
export const warm = () => get().postMessage({ warm: true });

// blob: the MediaRecorder recording; lang: the interview language. progress(pct) during the first download.
export async function recognize(blob, lang, progress) {
  const decoded = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await blob.arrayBuffer()); // resampled to 16 kHz
  const audio = decoded.getChannelData(0).slice(); // shortcut: first channel only; mics record mono
  onProgress = progress;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    get().postMessage({ id, audio, lang }, [audio.buffer]);
  });
}
