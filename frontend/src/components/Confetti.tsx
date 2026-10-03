import type { CSSProperties, ReactNode } from "react";

type Shape = {
  style: CSSProperties;
  node: ReactNode;
};

const INK = "#1B1347";

/** Quiet Memphis confetti that drifts behind the page. Purely decorative. */
const SHAPES: Shape[] = [
  {
    style: { top: "52%", right: "-36px", ["--rot" as string]: "14deg", ["--dur" as string]: "13s" },
    node: (
      <svg width="92" height="40" viewBox="0 0 92 40" fill="none">
        <path
          d="M4 24c6-18 14-18 20 0s14 18 20 0 14-18 20 0 10 12 14 6"
          stroke="#FF9FCF"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    style: { top: "46%", left: "-56px", ["--dur" as string]: "16s", ["--delay" as string]: "-4s" },
    node: (
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
        <circle cx="48" cy="48" r="38" stroke="#2A35E8" strokeWidth="12" opacity="0.9" />
      </svg>
    ),
  },
  {
    style: { bottom: "13%", right: "5%", ["--rot" as string]: "-12deg", ["--dur" as string]: "11s", ["--delay" as string]: "-2s" },
    node: (
      <svg width="62" height="56" viewBox="0 0 62 56">
        <path d="M31 4 58 52H4Z" fill="#5FE0B0" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    style: { top: "74%", left: "2%", ["--rot" as string]: "10deg", ["--dur" as string]: "14s", ["--delay" as string]: "-6s" },
    node: (
      <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
        <path d="M23 5v36M5 23h36" stroke="#FF8A78" strokeWidth="9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    style: { bottom: "5%", left: "12%", ["--dur" as string]: "17s", ["--delay" as string]: "-9s" },
    node: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill={INK}>
        {[10, 32, 54].flatMap((x) =>
          [10, 32, 54].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" opacity="0.35" />),
        )}
      </svg>
    ),
  },
  {
    style: { bottom: "26%", right: "-22px", ["--rot" as string]: "-8deg", ["--dur" as string]: "12s", ["--delay" as string]: "-3s" },
    node: (
      <svg width="70" height="36" viewBox="0 0 70 36">
        <path d="M2 34a33 33 0 0 1 66 0Z" fill="#FFC72C" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {SHAPES.map((shape, index) => (
        <span key={index} style={shape.style}>
          {shape.node}
        </span>
      ))}
    </div>
  );
}
