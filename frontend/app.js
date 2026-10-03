"use strict";
const $ = (id) => document.getElementById(id);
const apiPrefix = document.documentElement.dataset.apiPrefix || "";
const guides = {
  reading: "Read your study’s reference passage aloud at a comfortable pace.",
  sustained_a: "Take a comfortable breath and sustain “ah” at your usual pitch and loudness for at least 3 seconds.",
  spontaneous: "Speak naturally about a familiar topic. Only the participant should speak in the selected audio."
};
let chosenAudio = null, previewUrl = null, recording = false, busy = false;
let microphoneAvailable = Boolean(navigator.mediaDevices?.getUserMedia);
let stream = null, context = null, source = null, processor = null, timer = null, started = 0, chunks = [];
function error(message) { $("form-error").textContent = message; $("form-error").hidden = !message; }
function controls() {
  $("analyze").disabled = !chosenAudio || recording || busy;
  $("record").disabled = recording || busy || !microphoneAvailable;
  $("stop").disabled = !recording || busy;
  $("audio-file").disabled = recording || busy;
  $("task").disabled = recording || busy;
  $("age").disabled = busy;
  $("speaker-verified").disabled = busy;
}
function clearResult() { $("empty-result").hidden = false; $("result").hidden = true; }
function selectAudio(blob, name) {
  chosenAudio = {blob, name};
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  $("preview").src = previewUrl; $("preview").hidden = false;
  $("chosen-file").textContent = `${name} · ${(blob.size / 1048576).toFixed(2)} MiB`;
  clearResult();
  controls();
}
function waveBlob(samples, sampleRate) {
  const data = new ArrayBuffer(44 + samples.length * 2), view = new DataView(data);
  const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => { const clamped = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + i * 2, clamped * (clamped < 0 ? 32768 : 32767), true); });
  return new Blob([data], {type: "audio/wav"});
}
async function stopRecording() {
  if (!recording) return;
  recording = false; clearInterval(timer);
  const sampleRate = context.sampleRate;
  processor.disconnect(); source.disconnect(); stream.getTracks().forEach((track) => track.stop());
  await context.close(); processor = source = context = stream = null;
  const samples = new Float32Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0; chunks.forEach((chunk) => { samples.set(chunk, offset); offset += chunk.length; }); chunks = [];
  document.querySelector(".recorder").classList.remove("recording");
  $("recording-state").textContent = "Recording ready to review";
  $("audio-file").value = "";
  selectAudio(waveBlob(samples, sampleRate), "voice-recording.wav");
}
$("record").addEventListener("click", async () => {
  error(""); busy = true; controls();
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access requires localhost or HTTPS. You can upload a WAV file instead.");
    stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
    context = new (window.AudioContext || window.webkitAudioContext)(); await context.resume();
    source = context.createMediaStreamSource(stream); processor = context.createScriptProcessor(4096, 1, 1); chunks = [];
    processor.onaudioprocess = (event) => { if (recording) chunks.push(new Float32Array(event.inputBuffer.getChannelData(0))); };
    source.connect(processor); processor.connect(context.destination);
    recording = true; started = performance.now(); $("timer").textContent = "00:00";
    document.querySelector(".recorder").classList.add("recording"); $("recording-state").textContent = "Recording…";
    timer = setInterval(() => { const elapsed = Math.floor((performance.now() - started) / 1000); $("timer").textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`; if (elapsed >= 60) stopRecording(); }, 200);
  } catch (cause) {
    stream?.getTracks().forEach((track) => track.stop()); if (context) await context.close(); stream = context = null;
    error(cause.name === "NotAllowedError" ? "Microphone access was denied. Enable it in your browser or upload a WAV file." : cause.message);
  } finally { busy = false; controls(); }
});
$("stop").addEventListener("click", stopRecording);
$("audio-file").addEventListener("change", (event) => {
  error(""); const file = event.target.files[0];
  chosenAudio = null; $("preview").hidden = true; $("chosen-file").textContent = "No recording selected."; clearResult(); controls();
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".wav")) { error("Choose a WAV file. Other audio formats are not supported yet."); return; }
  if (file.size > 32 * 1048576) { error("Choose a WAV file smaller than 32 MiB."); return; }
  selectAudio(file, file.name);
});
$("task").addEventListener("change", () => { $("task-guide").textContent = guides[$("task").value]; clearResult(); });
$("age").addEventListener("input", clearResult);
$("speaker-verified").addEventListener("change", clearResult);
const statuses = {ok: "Voice pattern classified", model_unavailable: "Measurements ready · model awaiting training", model_incompatible: "Model configuration needs updating", outside_model_coverage: "Outside model coverage", insufficient_recording_quality: "Please repeat the recording", needs_speaker_review: "Speaker review needed"};
const issues = {too_short: "Record at least 2 seconds.", insufficient_signal_activity: "The recording is too quiet or contains too little active audio.", excessive_clipping: "Reduce microphone gain or move slightly farther from the microphone.", insufficient_voiced_audio: "Too little voiced audio was detected. Check the task and microphone.", speaker_review_required: "Confirm that only the participant speaks before requesting classification."};
function showResult(data) {
  $("empty-result").hidden = true; $("result").hidden = false;
  $("result-status").textContent = statuses[data.status] || data.status;
  $("summary").textContent = data.report.summary; $("result-disclaimer").textContent = data.report.disclaimer;
  const hasScore = Number.isFinite(data.classifier_score); $("score-panel").hidden = !hasScore;
  if (hasScore) { $("score").textContent = data.classifier_score.toFixed(3); $("classification").textContent = data.predicted_class === "pd_like" ? "PD-like voice pattern" : "Control-like voice pattern"; }
  $("quality-panel").hidden = !data.quality; $("quality-metrics").replaceChildren(); $("quality-issues").replaceChildren();
  if (data.quality) {
    const quality = data.quality;
    [["Selected duration", `${quality.duration_s.toFixed(1)} s`], ["Voiced audio", `${quality.voiced_duration_s.toFixed(1)} s`], ["Clipped samples", `${(quality.clipped_fraction * 100).toFixed(2)}%`], ["Speaker confirmed", quality.speaker_verified ? "Yes" : "Needs review"]].forEach(([name, value]) => { const term = document.createElement("dt"), description = document.createElement("dd"); term.textContent = name; description.textContent = value; $("quality-metrics").append(term, description); });
    [...quality.failures, ...quality.warnings].forEach((issue) => { const item = document.createElement("li"); item.textContent = issues[issue] || issue.replaceAll("_", " "); $("quality-issues").append(item); });
  }
  $("observations").replaceChildren(); $("observations-panel").hidden = !data.report.observations.length;
  data.report.observations.forEach((observation) => { const item = document.createElement("div"), top = document.createElement("div"), label = document.createElement("span"), value = document.createElement("strong"), description = document.createElement("p"); item.className = "observation"; top.className = "observation-top"; label.textContent = observation.label; value.textContent = `${Number(observation.value).toPrecision(4)} ${observation.unit}`; description.textContent = observation.explanation; top.append(label, value); item.append(top, description); $("observations").append(item); });
  $("provider-note").textContent = data.report.source === "gemini" ? "Gemini selected the measurements; explanations use reviewed wording." : "Explanations use reviewed wording. " + (data.report.provider_status === "unavailable_or_invalid_response" ? "Gemini was unavailable; local explanations were used." : "");
  $("result-json").textContent = JSON.stringify(data, null, 2);
}
$("analysis-form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (!chosenAudio || busy || recording) return;
  busy = true; controls(); error(""); $("analyze").textContent = "Analyzing…";
  try {
    const form = new FormData(); form.append(apiPrefix ? "audio" : "file", chosenAudio.blob, chosenAudio.name); form.append("age", $("age").value); form.append("task", $("task").value); form.append("speaker_verified", String($("speaker-verified").checked)); form.append("use_gemini", String($("use-gemini").checked));
    const response = await fetch(apiPrefix ? `${apiPrefix}/screen` : "/analyze", {method: "POST", body: form}); const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Check the age, task, and recording fields and try again.");
    showResult(data);
  } catch (cause) { error(cause.message || "The analysis service is unavailable. Try again."); }
  finally { busy = false; controls(); $("analyze").textContent = "Analyze recording ↗"; }
});
async function initialize() {
  try {
    const response = await fetch(`${apiPrefix}/config`); if (!response.ok) throw new Error(); const config = await response.json();
    $("service-status").textContent = config.model_available ? `A trained model is configured for ${config.model_task.replaceAll("_", " ")}. Model coverage starts at age ${config.minimum_age}.` : "The model is awaiting training. You can still check recording quality and explore acoustic measurements.";
    if (config.model_task && guides[config.model_task]) { $("task").value = config.model_task; $("task-guide").textContent = guides[config.model_task]; }
    $("use-gemini").disabled = !config.gemini_available; $("gemini-status").textContent = config.gemini_available ? "Gemini is available when selected. Local explanations are used otherwise." : "Gemini is not configured. Local explanations are available.";
  } catch { $("service-status").textContent = "The analysis service is unavailable. Start the backend and reload this page."; $("service-status").classList.add("failed"); }
  if (!navigator.mediaDevices?.getUserMedia) { $("record").disabled = true; $("recording-state").textContent = "Upload a WAV file to continue."; }
}
window.addEventListener("pagehide", () => { clearInterval(timer); stream?.getTracks().forEach((track) => track.stop()); context?.close(); if (previewUrl) URL.revokeObjectURL(previewUrl); });
initialize();
