"use client";

import { useId, type Ref } from "react";
import { TriangleAlert } from "lucide-react";

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Small grey line under the label, e.g. "Optional". */
  hint?: string;
  /** Shown with a warning icon, so it never relies on colour alone. */
  error?: string;
  maxLength?: number;
  /** "tel" brings up the number keypad. */
  type?: "text" | "tel";
  autoComplete?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** Pressing Enter / Go on the keyboard. */
  onEnter?: () => void;
};

/** One big, clearly labelled text box. */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  maxLength = 60,
  type = "text",
  autoComplete = "off",
  autoFocus,
  inputRef,
  onEnter,
}: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;

  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {hint ? <span className="field-hint">{hint}</span> : null}
      <input
        id={id}
        ref={inputRef}
        className="field-input"
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        enterKeyHint={onEnter ? "next" : "done"}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? noteId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
      />
      <p id={noteId} className="field-error" role="alert">
        {error ? (
          <>
            <TriangleAlert className="h-5 w-5 flex-none" strokeWidth={2.75} aria-hidden="true" />
            {error}
          </>
        ) : null}
      </p>
    </div>
  );
}
