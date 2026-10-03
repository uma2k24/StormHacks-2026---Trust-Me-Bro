type PagerDotsProps = {
  count: number;
  /** Zero-based. */
  current: number;
  label: string;
};

/** Little progress dots: filled for done, coral for here. */
export function PagerDots({ count, current, label }: PagerDotsProps) {
  return (
    <div
      className="dots"
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={current + 1}
      aria-valuetext={`Step ${current + 1} of ${count}`}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="dot"
          data-state={index < current ? "done" : index === current ? "current" : "todo"}
        />
      ))}
    </div>
  );
}
