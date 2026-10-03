import type { CSSProperties, ReactNode } from "react";

type WindowProps = {
  title: string;
  tone?: "lilac" | "sky" | "pink" | "yellow" | "mint";
  /** Small plate on the right of the title bar. */
  aside?: ReactNode;
  /** Position in the entrance sequence (windows pop in one after another). */
  index?: number;
  lift?: boolean;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  children: ReactNode;
};

/** A 90s-desktop window: pinstriped title bar, close box, hard shadow. */
export function Window({
  title,
  tone = "lilac",
  aside,
  index = 0,
  lift = false,
  className = "",
  bodyClassName = "",
  padded = true,
  children,
}: WindowProps) {
  const headingId = `win-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section
      aria-labelledby={headingId}
      className={`window pop-in ${lift ? "lift" : ""} ${className}`}
      style={{ "--i": index } as CSSProperties}
    >
      <div className={`titlebar tb-${tone}`}>
        <span className="titlebar-box" aria-hidden="true" />
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
