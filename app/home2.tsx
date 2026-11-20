import { Inter } from "next/font/google";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export default function Home() {
  return (
    <div className={`${inter.className} min-h-screen`}>
      {/* ===== Hero section — warm beige ===== */}
      <section className="relative min-h-[70vh] bg-[#F2E9DC] text-neutral-950 flex flex-col justify-start px-6 sm:px-12 pt-40 py-24">
        {/* Logo placeholder — top left */}
        <div className="absolute top-6 left-6 flex items-center justify-center w-14 h-14 rounded-xl bg-neutral-950 shadow-sm">
          <span className="text-xl font-bold tracking-tight text-[#F2E9DC]">JT</span>
        </div>

        <div className="max-w-6xl mx-auto text-left">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1]">
            Meet Jodo. An ADHD-friendly productivity todo list.
            <br />
          </h1>

          <h1 className = "mt-3 text-3xl sm:text-4xl tracking-tight leading-[1.1]">
            Beats task paralysis, creates time pressure, boosts natural dopamine.
          </h1>

          <p className="mt-40 text-lg text-neutral-700 font-medium">
            Plan first, then strike. 
          </p>

          <div className="mt-5 flex items-center justify-start gap-4">
            <Link
                href="/plan"
                className="px-8 py-3 rounded-lg bg-neutral-950 text-[#F2E9DC] font-semibold text-sm tracking-wide hover:bg-neutral-800 transition-colors inline-block"
            >
                Plan
            </Link>
            {/*<button
              type="button"
              className="px-8 py-3 rounded-lg bg-neutral-950 text-[#F2E9DC] font-semibold text-sm tracking-wide hover:bg-neutral-700 transition-colors"
            >
              Plan
            </button> */}

            <button
              type="button"
              className="px-8 py-3 rounded-lg bg-transparent text-neutral-950 font-semibold text-sm tracking-wide border border-neutral-950/40 hover:bg-neutral-950/5 transition-colors"
            >
              Strike
            </button>
          </div>
        </div>
      </section>

      {/* ===== Bottom section — black gradient ===== */}
      <section className="min-h-[50vh] bg-gradient-to-b from-neutral-900 to-black text-white flex items-center justify-center px-6 py-24">
        <div className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-white/20 text-base font-semibold tracking-widest uppercase text-white/70">
          How to Use
        </div>
      </section>
    </div>
  );
}