import type { CSSProperties, ReactNode } from "react";

type WindowProps = {
  title: string;
  /** Small plate on the right of the title bar. */
  aside?: ReactNode;
  /** Position in the entrance sequence (windows pop in one after another). */
  index?: number;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  children: ReactNode;
};

/** A 90s-desktop window: pinstriped teal title bar, hard shadow. */
export function Window({
  title,
  aside,
  index = 0,
  className = "",
  bodyClassName = "",
  padded = true,
  children,
}: WindowProps) {
  const headingId = `win-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section
      aria-labelledby={headingId}
      className={`window pop-in ${className}`}
      style={{ "--i": index } as CSSProperties}
    >
      <div className="titlebar">
        <h2 id={headingId} className="titlebar-title">
          {title}
        </h2>
        {aside ? <span className="titlebar-aside">{aside}</span> : null}
      </div>
      <div className={`${padded ? "window-body" : ""} ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}
