// Module worker for the answer 🎤: open-source Whisper runs here, so the recording never leaves the device.
// In: { warm: true } (start the download while the user speaks) or { id, audio: Float32Array 16 kHz mono, lang }.
// Out: { progress: pct } while the model downloads, then { id, text } or { id, error: true }.
import * as tf from "./vendor/transformers.min.js";
import { load, recognize } from "./stt-whisper.js";

tf.env.allowLocalModels = false;
tf.env.backends.onnx.wasm.wasmPaths = "/vendor/"; // the runtime from this site (CSP script-src 'self'), not a CDN
let ready = null;

self.onmessage = async ({ data }) => {
  try {
    ready ??= load(tf, (progress) => self.postMessage({ progress }));
    const m = await ready;
    if (data.audio) self.postMessage({ id: data.id, text: await recognize(m, data.audio, data.lang) });
  } catch (e) {
    ready = null; // a failed download is retried on the next recording
    console.error("stt worker:", e?.name, e?.message); // never log the transcript
    self.postMessage({ id: data.id, error: true });
  }
};
