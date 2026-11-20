import TransitionLink from "./TransitionLink";

type Props = {
  word: string; // shown one letter per line, e.g. "PLAN"
  borderClass: string; // right-edge divider colour
};

/**
 * Left column: JT logo pinned top-left (same spot and size as on the home page),
 * the page name stacked vertically in the middle.
 */
export default function SideTitle({ word, borderClass }: Props) {
  return (
    <aside
      data-dirt
      className={`sticky top-0 z-10 h-screen w-24 sm:w-28 shrink-0 flex flex-col items-center border-r ${borderClass}`}
    >
      <TransitionLink
        kind="slide"
        href="/"
        aria-label="Jodo home"
        className="absolute top-6 left-6 flex items-center justify-center w-14 h-14 rounded-xl bg-[#F2E9DC] shadow-sm hover:bg-white transition-colors"
      >
        <span className="text-xl font-bold tracking-tight text-neutral-950">JT</span>
      </TransitionLink>

      <h1
        aria-label={word}
        className="flex-1 flex flex-col items-center justify-center pt-20 pb-10 text-4xl sm:text-6xl font-extrabold leading-[1.05] tracking-tight"
      >
        {word.split("").map((letter, i) => (
          <span key={i} aria-hidden="true">
            {letter}
          </span>
        ))}
      </h1>
    </aside>
  );
}
