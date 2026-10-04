const el = (id) => document.getElementById(id);

const state = {
  config: null,
  stream: null,
  taskIndex: 0,
  clips: [],
};

/** Decodes recorded audio and resamples it to mono 16 kHz, matching the model input. */
async function toModelSamples(arrayBuffer, targetRate) {
  const decodeCtx = new AudioContext();
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  await decodeCtx.close();

  const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineAudioContext(1, frames, targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function startLevelMeter(stream) {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);
  let running = true;

  (function tick() {
    if (!running) return;
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (const sample of buffer) sum += sample * sample;
    const rms = Math.sqrt(sum / buffer.length);
    el("meter-fill").style.width = `${Math.min(100, rms * 400)}%`;
    requestAnimationFrame(tick);
  })();

  return () => {
    running = false;
    el("meter-fill").style.width = "0%";
    ctx.close();
  };
}

function recordFor(stream, seconds) {
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onerror = reject;
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    recorder.start();

    let remaining = seconds;
    el("countdown").textContent = `${remaining}s left`;
    const timer = setInterval(() => {
      remaining -= 1;
      el("countdown").textContent = remaining > 0 ? `${remaining}s left` : "Analyzing...";
      if (remaining <= 0) {
        clearInterval(timer);
        recorder.stop();
      }
    }, 1000);
  });
}

function renderTask() {
  const task = state.config.tasks[state.taskIndex];
  el("task-counter").textContent = `Task ${state.taskIndex + 1} of ${state.config.tasks.length}`;
  el("task-title").textContent = task.title;
  el("task-prompt").textContent = task.prompt;
  el("task-hint").textContent = `${task.hint} (${task.seconds} seconds)`;
  el("record").textContent = `Start recording (${task.seconds}s)`;
  el("record").disabled = false;
  el("countdown").textContent = "";
}

function addResultRow(list, label, result) {
  const item = document.createElement("li");
  const name = document.createElement("span");
  name.textContent = label;
  const value = document.createElement("span");
  value.className = "value";
  value.textContent = `${result.probability.toFixed(3)} ${result.flagged ? "flagged" : "not flagged"}`;
  value.style.color = result.flagged ? "var(--bad)" : "var(--ok)";
  item.append(name, value);
  list.append(item);
}

async function runTask() {
  const task = state.config.tasks[state.taskIndex];
  el("record").disabled = true;
  const stopMeter = startLevelMeter(state.stream);

  let result;
  try {
    const blob = await recordFor(state.stream, task.seconds);
    const samples = await toModelSamples(await blob.arrayBuffer(), state.config.sampleRate);
    const response = await fetch(`/api/screen?task=${encodeURIComponent(task.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: samples.buffer,
    });
    if (!response.ok) throw new Error((await response.json()).detail || response.statusText);
    result = await response.json();
  } catch (error) {
    el("countdown").textContent = `Error: ${error.message}`;
    el("record").disabled = false;
    stopMeter();
    return;
  }
  stopMeter();

  if (result.tooQuiet) {
    el("countdown").textContent = "That was nearly silent - check your mic and try again.";
    el("record").disabled = false;
    return;
  }

  state.clips.push({ task: task.id, probability: result.probability });
  addResultRow(el("task-results"), task.title, result);
  el("countdown").textContent = "";

  state.taskIndex += 1;
  if (state.taskIndex < state.config.tasks.length) {
    renderTask();
  } else {
    await showFinalResult();
  }
}

async function showFinalResult() {
  el("check-in").classList.add("hidden");
  const response = await fetch("/api/combine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clips: state.clips }),
  });
  const combined = await response.json();
  const { threshold, probability, flagged } = combined;

  el("verdict").textContent = flagged
    ? "Flagged: speech patterns resemble the Parkinson's group"
    : "Not flagged: speech patterns resemble the control group";
  el("verdict").className = `verdict ${flagged ? "flagged" : "clear"}`;
  el("gauge-fill").style.width = `${probability * 100}%`;
  el("gauge-mark").style.left = `${threshold * 100}%`;
  el("score-line").textContent =
    `Probability ${probability.toFixed(3)} against a decision threshold of ${threshold.toFixed(3)}.`;

  el("breakdown").replaceChildren(
    ...state.clips.map((clip) => {
      const task = state.config.tasks.find((t) => t.id === clip.task);
      const row = document.createElement("div");
      row.textContent =
        `${task.title}: ${clip.probability.toFixed(3)} (weight ${(task.weight * 100).toFixed(0)}%)`;
      return row;
    }),
  );

  const v = state.config.validation;
  el("validation").textContent =
    `Held-out Italian speakers: AUC ${v.heldOutItalianSubjectAuc.toFixed(2)}. ` +
    `On English smartphone recordings the same model only reaches AUC ${v.externalEnglishAuc.toFixed(2)} ` +
    `with ${(v.externalEnglishSensitivity * 100).toFixed(0)}% sensitivity, so a "not flagged" result on a ` +
    `new microphone is weak evidence.`;

  el("result").classList.remove("hidden");
}

async function scoreFiles(files) {
  const list = el("file-results");
  for (const file of files) {
    const pending = document.createElement("li");
    pending.textContent = `${file.name}: scoring...`;
    list.append(pending);

    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/screen-file", { method: "POST", body: form });
    pending.remove();
    if (!response.ok) {
      const failed = document.createElement("li");
      failed.textContent = `${file.name}: ${(await response.json()).detail}`;
      list.append(failed);
      continue;
    }
    addResultRow(list, file.name, await response.json());
  }
}

el("enable-mic").addEventListener("click", async () => {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (error) {
    el("mic-status").textContent = `Microphone unavailable: ${error.message}`;
    return;
  }
  el("permission").classList.add("hidden");
  el("check-in").classList.remove("hidden");
  renderTask();
});

el("record").addEventListener("click", runTask);

el("restart").addEventListener("click", () => {
  state.taskIndex = 0;
  state.clips = [];
  el("task-results").replaceChildren();
  el("result").classList.add("hidden");
  el("check-in").classList.remove("hidden");
  renderTask();
});

el("file-input").addEventListener("change", (event) => {
  scoreFiles([...event.target.files]);
  event.target.value = "";
});

(async () => {
  state.config = await (await fetch("/api/config")).json();
})();
