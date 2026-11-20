import { Inter, Unbounded } from "next/font/google";
import HomeSky from "./components/HomeSky";
import SwayText from "./components/SwayText";
import TransitionLink from "./components/TransitionLink";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

const unbounded = Unbounded({ subsets: ["latin"], weight: ["900"] });

export default function Home() {
  return (
    <div className={`${inter.className} relative min-h-screen bg-neutral-950`}>
      <HomeSky />
      {/* ===== Hero section — warm beige ===== */}
      <section className="relative z-10 min-h-[70vh] text-[#F2E9DC] flex flex-col justify-start px-6 sm:px-12 pt-40 py-24">
        {/* Logo placeholder — top left */}
        <div className="absolute top-6 left-6 flex items-center justify-center w-14 h-14 rounded-xl bg-[#F2E9DC] shadow-sm">
          <span className="text-xl font-bold tracking-tight text-neutral-950">JT</span>
        </div>

        <div className="max-w-6xl mx-auto text-left">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] text-balance">
            <SwayText text="Meet " />
            <span className="whitespace-nowrap">
              <SwayText
                text="Jodo"
                slashTarget
                className={`${unbounded.className} font-black italic tracking-normal text-[1.3em] leading-none`}
              />
              <SwayText text="." />
            </span>
            <SwayText text=" An ADHD-friendly productivity todo list." />
            <br />
          </h1>

          <h1 className = "mt-4 text-lg sm:text-2xl tracking-tight leading-snug text-[#F2E9DC]/80">
            <SwayText text="Beats task paralysis, creates time pressure, boosts natural dopamine." />
          </h1>

          <p className="mt-40 text-xl text-center text-[#F2E9DC]/70 font-medium">
            <SwayText text="Plan first, then strike." />
          </p>

          <div className="mt-6 flex items-center justify-center gap-5">
            <TransitionLink
                kind="warp"
                href="/plan"
                className="group relative inline-block px-14 py-5 rounded-xl bg-[#F2E9DC] text-neutral-950 font-bold text-xl tracking-wide transition-all duration-200 hover:-translate-y-1 hover:bg-white hover:shadow-[0_10px_30px_-5px_rgba(242,233,220,0.45)] active:translate-y-0 active:scale-95 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F2E9DC]/50"
            >
                Plan
                <span
                  aria-hidden="true"
                  className="absolute right-5 top-1/2 -translate-y-1/2 -translate-x-2 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                >
                  →
                </span>
            </TransitionLink>
            {/*<button
              type="button"
              className="px-8 py-3 rounded-lg bg-neutral-950 text-[#F2E9DC] font-semibold text-sm tracking-wide hover:bg-neutral-700 transition-colors"
            >
              Plan
            </button> */}

            <TransitionLink
              kind="slash"
              href="/strike"
              className="group relative inline-block px-14 py-5 rounded-xl bg-transparent text-[#F2E9DC] font-bold text-xl tracking-wide border-2 border-[#F2E9DC]/40 transition-all duration-200 hover:-translate-y-1 hover:bg-red-600 hover:border-red-600 hover:text-white hover:shadow-[0_10px_30px_-5px_rgba(239,68,68,0.6)] active:translate-y-0 active:scale-95 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/50"
            >
              Strike
              <span
                aria-hidden="true"
                className="absolute right-5 top-1/2 -translate-y-1/2 -translate-x-2 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
              >
                →
              </span>
            </TransitionLink>
          </div>
        </div>
      </section>

      {/* ===== Bottom section — black gradient ===== */}
      <section className="relative z-10 min-h-[50vh] bg-gradient-to-b from-transparent to-black text-white flex items-center justify-center px-6 py-24">
        <div className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-white/20 text-base font-semibold tracking-widest uppercase text-white/70">
          How to Use
        </div>
      </section>
    </div>
  );
}