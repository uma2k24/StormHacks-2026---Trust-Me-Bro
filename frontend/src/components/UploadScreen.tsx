"use client";

import { type DragEvent, useRef, useState } from "react";
import { ArrowLeft, FileMusic, FilePlus, TriangleAlert, X } from "lucide-react";
import { Window } from "@/components/Window";
import { decodeAudio, MAX_SPEECH_SECONDS, MAX_VOWEL_SECONDS, type Upload } from "@/lib/voiceClient";

const RATE = 16000; // decodeAudio hands back 16 kHz audio
/** Bigger than this isn't opened at all: reading it would stall the page. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const ACCEPT = "audio/*,.wav,.mp3,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm";

/** One chosen file: being read, ready to be checked, or something the browser couldn't open. */
type Picked = {
  id: number;
  name: string;
  state: "reading" | "ready" | "unreadable";
  audio?: Float32Array;
  problem?: string;
};

type UploadScreenProps = {
  /** Why the last try didn't work, shown at the top. */
  problem: string | null;
  /** The listener has chosen what to check. */
  onAnalyse: (upload: Upload) => void;
  onBack: () => void;
};

const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
const lengthOf = (file: Picked) => (file.audio ? minutes(file.audio.length / RATE) : "");

/**
 * Upload instead of talking to the radio: recordings of the listener talking (the same thing the
 * show's questions collect) and, optionally, one of them holding an "ahhh" (which is where the
 * detailed numbers on the vitals page come from). The files are read here, in the browser, so
 * the server gets exactly what a show's own recordings would have given it.
 * Web only: the iOS app has no upload.
 */
export function UploadScreen({ problem, onAnalyse, onBack }: UploadScreenProps) {
  const [talking, setTalking] = useState<Picked[]>([]);
  const [held, setHeld] = useState<Picked | null>(null);
  const nextId = useRef(0);

  const readAll = (files: File[], add: (picked: Picked) => void, update: (id: number, changes: Partial<Picked>) => void) => {
    for (const file of files) {
      const id = nextId.current++;
      if (file.size > MAX_FILE_BYTES) {
        add({ id, name: file.name, state: "unreadable", problem: "This file is too big." });
        continue;
      }
      add({ id, name: file.name, state: "reading" });
      void decodeAudio(file).then((audio) =>
        update(
          id,
          audio && audio.length
            ? { state: "ready", audio }
            : { state: "unreadable", problem: "Couldn’t open this file." },
        ),
      );
    }
  };

  const chooseTalking = (files: File[]) =>
    readAll(
      files,
      (picked) => setTalking((current) => [...current, picked]),
      (id, changes) => setTalking((current) => current.map((file) => (file.id === id ? { ...file, ...changes } : file))),
    );
  // only one "ahhh": a newer choice replaces the old one
  const chooseHeld = (files: File[]) =>
    readAll(
      files.slice(0, 1),
      (picked) => setHeld(picked),
      (id, changes) => setHeld((current) => (current?.id === id ? { ...current, ...changes } : current)),
    );

  const readyTalking = talking.filter((file) => file.state === "ready");
  const readyHeld = held?.state === "ready" ? held : null;
  const reading = talking.some((file) => file.state === "reading") || held?.state === "reading";
  const canCheck = !reading && (readyTalking.length > 0 || readyHeld !== null);
  const talkingSeconds = readyTalking.reduce((sum, file) => sum + (file.audio?.length ?? 0) / RATE, 0);
  const heldSeconds = readyHeld?.audio ? readyHeld.audio.length / RATE : 0;

  const check = () => {
    if (!canCheck) return;
    onAnalyse({
      speech: readyTalking.flatMap((file) => (file.audio ? [file.audio] : [])),
      vowel: readyHeld?.audio ?? null,
    });
  };

  return (
    <section className="flex flex-1 flex-col">
      <header className="mb-5 text-center">
        <h1 className="display h2">Upload audio</h1>
        <p className="lede mx-auto mt-3 max-w-[24rem]">The radio listens to a recording instead of a chat.</p>
      </header>

      {problem ? (
        <p className="upload-problem mb-5" role="alert">
          <TriangleAlert className="h-6 w-6 flex-none" strokeWidth={2.5} aria-hidden="true" />
          {problem}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <Slot
          title="Your talking"
          index={0}
          hint="You talking, for ten seconds or more."
          files={talking}
          onChoose={chooseTalking}
          onRemove={(id) => setTalking((current) => current.filter((file) => file.id !== id))}
          multiple
          note={talkingSeconds > MAX_SPEECH_SECONDS ? `Only the first ${MAX_SPEECH_SECONDS / 60} minutes are used.` : ""}
        />
        <Slot
          title="Your “ahhh”"
          index={1}
          hint="Optional. You holding “ahhh” for as long as you can. It adds detail to your vitals."
          files={held ? [held] : []}
          onChoose={chooseHeld}
          onRemove={() => setHeld(null)}
          note={heldSeconds > MAX_VOWEL_SECONDS ? `Only the first ${MAX_VOWEL_SECONDS} seconds are used.` : ""}
        />
      </div>

      <nav className="pager-nav mt-4" aria-label="Upload">
        <div className="pager-buttons">
          <button type="button" onClick={onBack} className="btn btn-back" aria-label="Back">
            <ArrowLeft className="h-7 w-7" strokeWidth={2.75} aria-hidden="true" />
          </button>
          <button type="button" onClick={check} disabled={!canCheck} className="btn btn-accent btn-big flex-1">
            Check my voice
          </button>
        </div>
      </nav>
    </section>
  );
}

type SlotProps = {
  title: string;
  index: number;
  hint: string;
  files: Picked[];
  /** Whether more than one file can be chosen. */
  multiple?: boolean;
  /** Shown under the files when something about them needs saying. */
  note: string;
  onChoose: (files: File[]) => void;
  onRemove: (id: number) => void;
};

/** One place to put files: a button to choose them (or drop them here) and the list of what was chosen. */
function Slot({ title, index, hint, files, multiple = false, note, onChoose, onRemove }: SlotProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const verb = !files.length ? "Choose a file" : multiple ? "Add another" : "Change file";

  const take = (list: FileList | null) => {
    const chosen = Array.from(list ?? []);
    if (chosen.length) onChoose(chosen);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    take(event.dataTransfer.files);
  };

  return (
    <Window title={title} index={index}>
      <div
        className="upload-slot"
        data-over={over}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <p className="field-hint m-0">{hint}</p>

        {files.length ? (
          <ul className="upload-files" aria-live="polite">
            {files.map((file) => (
              <li key={file.id} className="upload-file" data-state={file.state}>
                {file.state === "unreadable" ? (
                  <TriangleAlert className="h-6 w-6 flex-none" strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  <FileMusic className="h-6 w-6 flex-none" strokeWidth={2.5} aria-hidden="true" />
                )}
                <span className="upload-file-text">
                  <span className="upload-file-name">{file.name}</span>
                  <span className="upload-file-note">
                    {file.state === "reading" ? "Opening…" : file.state === "unreadable" ? file.problem : lengthOf(file)}
                  </span>
                </span>
                <button type="button" onClick={() => onRemove(file.id)} className="upload-remove" aria-label={`Remove ${file.name}`}>
                  <X className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {note ? <p className="field-hint m-0">{note}</p> : null}

        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple={multiple}
          hidden
          onChange={(event) => {
            take(event.target.files);
            event.target.value = ""; // so choosing the same file again still counts
          }}
        />
        <button type="button" onClick={() => input.current?.click()} className="btn btn-teal btn-block">
          <FilePlus className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
          {verb}
        </button>
      </div>
    </Window>
  );
}
