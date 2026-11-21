import TransitionLink from "./TransitionLink";

type Props = {
  word: string; // shown one letter per line, e.g. "PLAN"
};

/**
 * Left column: Home button pinned top-left (same spot and size as on the home page),
 * the page name stacked vertically in the middle. No divider — it sits on the page background.
 */
export default function SideTitle({ word }: Props) {
  return (
    <aside data-dirt className="sticky top-0 z-10 h-screen w-24 sm:w-28 shrink-0 flex flex-col items-center">
      <TransitionLink
        kind="slide"
        href="/"
        aria-label="Home"
        className="absolute top-6 left-6 flex items-center justify-center w-14 h-14 rounded-xl bg-[#F2E9DC] shadow-sm hover:bg-white transition-colors"
      >
        <span className="text-sm font-bold tracking-tight text-neutral-950">Home</span>
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
