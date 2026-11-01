"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ICS_PATH, WEDDING, countdown, googleCalendarUrl, type Countdown } from "@/lib/saveTheDate";
import { MONTAGE, PHOTOS } from "./photos";
import s from "./saveTheDate.module.css";

// Emerald jharokha: emerald + antique gold + ivory, a Mughal arch frame, and a
// ruby heart to scratch. Story, one continuous take: the envelope opens and
// flies into the camera, confetti falls while your photos fly past (a
// cinema-intro fly-through), the palace doors arrive as the last frame, swing
// open, and the arch draws itself in. A gallery of every photo sits below.

type Stage = "envelope" | "intro" | "open";

// The whole timeline, in seconds after the seal is tapped. Single source:
// these are handed to the CSS as custom properties (see timelineVars).
const T = {
  envelopeZoom: 2.0, // card is out; envelope flies into the camera
  montage: 2.3, // first photo starts its flight
  stagger: 0.42, // gap between photos
  flight: 2.4, // one photo's flight, far → past the camera
  doorsIn: 8.9, // doors fly in as the final frame
  doorsOpen: 10.4, // …then swing open
  arch: 10.9, // arch lines draw in
  content: 11.3, // names, heart fade up
  done: 11.4, // montage unmounts, page scroll unlocks
};

const timelineVars = {
  "--t-env-zoom": `${T.envelopeZoom}s`,
  "--t-doors-in": `${T.doorsIn}s`,
  "--t-doors-open": `${T.doorsOpen}s`,
  "--t-arch": `${T.arch}s`,
  "--t-content": `${T.content}s`,
} as CSSProperties;

export function SaveTheDate({
  palette,
  fromApp = false,
}: {
  /** Rollback palettes: "emerald" (live until maroon) or "classic" (darker green). */
  palette?: string;
  /** Opened from inside weddingHQ (`?from=app`): show a small way back.
   *  Guests arriving from a shared link never see it. */
  fromApp?: boolean;
}) {
  const [stage, setStage] = useState<Stage>("envelope");
  // Bumped by Replay: remounts the whole card so every CSS animation and the
  // scratch cover start fresh.
  const [run, setRun] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [muted, setMuted] = useState(false);
  const music = useRef<Music | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => music.current?.stop(), []);

  // No scrolling down into the gallery until the intro has played.
  useEffect(() => {
    if (stage === "open") return;
    const html = document.documentElement;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = "";
    };
  }, [stage]);

  function open() {
    if (stage !== "envelope") return;
    // Audio must start inside the tap itself or iOS keeps it silent.
    music.current ??= startMusic(MUSIC_PEAK_AT - T.doorsOpen);
    window.scrollTo(0, 0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return skip();
    setStage("intro");
    doneTimer.current = setTimeout(() => setStage("open"), T.done * 1000);
  }

  function skip() {
    if (doneTimer.current) clearTimeout(doneTimer.current);
    setSkipped(true);
    setStage("open");
  }

  // Back to the sealed envelope; the guest taps the seal again, and the music
  // restarts from the same point as the first time (doors on the swell).
  function replay() {
    if (doneTimer.current) clearTimeout(doneTimer.current);
    music.current?.stop();
    music.current = null;
    setMuted(false);
    setSkipped(false);
    setStage("envelope");
    setRun((r) => r + 1);
    window.scrollTo(0, 0);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    music.current?.setMuted(next);
  }

  const cls = [
    s.root,
    palette === "emerald" && s.emerald,
    palette === "classic" && s.classic,
    stage !== "envelope" && s.opened,
    skipped && s.skipped,
  ];
  return (
    <div key={run} className={cls.filter(Boolean).join(" ")} style={timelineVars}>
      <Main onReplay={replay} />
      {/* Covers the card until the doors have arrived over it. */}
      <div className={s.curtain} aria-hidden />
      {stage !== "open" && <Montage />}
      <Doors />
      {stage !== "open" && <Envelope opening={stage === "intro"} onOpen={open} />}
      {stage === "intro" && (
        <button type="button" className={s.skip} onClick={skip}>
          Skip
        </button>
      )}
      {stage !== "envelope" && (
        <button
          type="button"
          className={s.mute}
          onClick={toggleMute}
          aria-label={muted ? "Turn music on" : "Turn music off"}
        >
          <SpeakerIcon muted={muted} />
        </button>
      )}
      {stage === "open" && (
        <button
          type="button"
          className={s.replay}
          onClick={replay}
          aria-label="Watch the opening again"
        >
          <ReplayIcon />
        </button>
      )}
      {fromApp && (
        <Link href="/" className={s.back} aria-label="Back to weddingHQ">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
      )}
    </div>
  );
}

function ReplayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12a8 8 0 1 0 2.3-5.6" />
      <path d="M4 4v4.5h4.5" />
    </svg>
  );
}

// ─── Envelope ──────────────────────────────────────────────────────────────

function Envelope({ opening, onOpen }: { opening: boolean; onOpen: () => void }) {
  return (
    <div className={`${s.envelopeStage} ${opening ? s.opening : ""}`}>
      <div className={s.envelope}>
        {/* The card tucked inside — rises out once the flap is open. */}
        <div className={s.card}>
          <p className={s.cardEyebrow}>Save the Date</p>
          <p className={s.cardNames}>{WEDDING.shortNames}</p>
        </div>
        <div className={s.pocket} />
        <div className={s.flap}>
          <div className={s.flapFace} />
          <Beadwork />
          <div className={s.monogram} aria-hidden>
            <span>S</span>
            <span className={s.monoAmp}>&amp;</span>
            <span>S</span>
          </div>
          <p className={s.flapNames}>{WEDDING.shortNames}</p>
          <Divider />
          <svg className={s.lace} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path
              d="M0 47 L50 82 L100 47"
              className={s.laceLine}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M0 44 L50 78.5 L100 44"
              className={s.laceDots}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <button type="button" className={s.seal} onClick={onOpen} aria-label="Open the envelope">
          <Seal />
        </button>
        <p className={s.tapHint}>Tap the seal to open</p>
      </div>
    </div>
  );
}

function Seal() {
  return (
    <svg viewBox="0 0 100 100" className={s.sealSvg} aria-hidden>
      <defs>
        <path id="sealRing" d="M50 50 m-33 0 a33 33 0 1 1 66 0 a33 33 0 1 1 -66 0" />
      </defs>
      <circle cx="50" cy="50" r="40" className={s.sealInner} />
      <text className={s.sealRingText}>
        <textPath href="#sealRing" startOffset="0" textLength="203" lengthAdjust="spacing">
          SAVE THE DATE · SWARA & SHIVAM ·
        </textPath>
      </text>
      <text x="50" y="59" textAnchor="middle" className={s.sealMono}>
        S&amp;S
      </text>
    </svg>
  );
}

// Fine gold "beadwork" in the flap's top corners. Deterministic positions
// (no Math.random) so server and client render match.
function Beadwork() {
  const dots = Array.from({ length: 60 }, (_, i) => {
    const a = (i * 137.5 * Math.PI) / 180;
    const r = 3 + ((i * 7) % 22);
    // Rounded: server and browser trig differ in the last float digits,
    // which would otherwise be a hydration mismatch.
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      x: round(Math.abs(Math.cos(a)) * r),
      y: round(Math.abs(Math.sin(a)) * r * 0.9),
      size: 0.25 + ((i * 3) % 5) * 0.09,
    };
  });
  return (
    <svg
      className={s.beadwork}
      viewBox="0 0 100 40"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden
    >
      {dots.map((d, i) => (
        <g key={i}>
          <circle cx={d.x + 3} cy={d.y + 2} r={d.size} />
          <circle cx={97 - d.x} cy={d.y + 2} r={d.size} />
        </g>
      ))}
    </svg>
  );
}

function Divider() {
  return (
    <div className={s.divider} aria-hidden>
      <span />
      <svg viewBox="0 0 20 10" width="20" height="10">
        <path d="M10 1l3 4-3 4-3-4z" />
      </svg>
      <span />
    </div>
  );
}

// ─── Palace doors ──────────────────────────────────────────────────────────

function Doors() {
  return (
    <div className={s.doorsScene} aria-hidden>
      <div className={s.doors}>
        <div className={`${s.door} ${s.doorL}`}>
          <i className={s.knob} />
        </div>
        <div className={`${s.door} ${s.doorR}`}>
          <i className={s.knob} />
        </div>
      </div>
    </div>
  );
}

// ─── Montage: confetti + photos flying past the camera ────────────────────

// Hand-placed flight lanes (vw, vh, deg) so photos fan out around the centre
// rather than stacking. The last one — the ring — flies dead centre.
const LANES: [number, number, number][] = [
  [-22, -14, -6],
  [18, 10, 5],
  [-12, 16, -4],
  [24, -12, 7],
  [-26, 6, -8],
  [10, -18, 4],
  [-6, 14, -3],
  [20, -6, 6],
  [-18, 12, -5],
  [14, -16, 8],
  [-24, 4, -7],
  [8, 18, 3],
  [-14, -10, -4],
  [22, 8, 6],
  [-8, -4, -2],
  [0, 0, 0],
];
const CONFETTI_COLOURS = ["#c9a45c", "#e8cf8f", "#f4ead6", "#9b2240", "#2fa37c"];

function Montage() {
  return (
    <div className={s.montage} aria-hidden>
      {MONTAGE.map((p, i) => {
        const [x, y, r] = LANES[i % LANES.length];
        return (
          <figure
            key={p.src}
            className={`${s.flyer} ${p.h > p.w ? s.flyerTall : ""}`}
            style={
              {
                "--x": `${x}vw`,
                "--y": `${y}vh`,
                "--r": `${r}deg`,
                "--delay": `${T.montage + i * T.stagger}s`,
                "--flight": `${T.flight}s`,
                aspectRatio: `${p.w} / ${p.h}`,
              } as CSSProperties
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- plain static files; preloaded while the envelope waits */}
            <img src={p.src} alt="" />
          </figure>
        );
      })}
      {Array.from({ length: 70 }, (_, i) => (
        <i
          key={i}
          className={s.confetti}
          style={
            {
              left: `${(i * 37) % 100}%`,
              background: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
              "--delay": `${T.envelopeZoom + (i % 14) * 0.28}s`,
              "--fall": `${3.2 + (i % 5) * 0.45}s`,
              "--sway": `${((i * 13) % 9) - 4}vw`,
              "--spin": `${(i % 2 ? 1 : -1) * (360 + (i % 4) * 180)}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ─── Main card ─────────────────────────────────────────────────────────────

function Main({ onReplay }: { onReplay: () => void }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <main className={s.main}>
      <div className={s.dust} aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 53) % 100}%`,
              animationDelay: `${(i * 1.3) % 11}s`,
              animationDuration: `${10 + (i % 5) * 2}s`,
            }}
          />
        ))}
      </div>

      <section className={s.hero}>
        <div className={s.arch}>
          <Arch />
          <div className={s.archContent}>
            <p className={s.eyebrow}>Save the Date</p>
            <h1 className={s.names}>
              <span>{WEDDING.partnerA}</span>
              <span className={s.amp}>&amp;</span>
              <span>{WEDDING.partnerB}</span>
            </h1>
            <p className={s.subline}>are getting married</p>
            <Divider />
            {/* Centred in whatever height the arch leaves, so a tall phone gets
                even space above and below rather than a gap at the bottom. */}
            <div className={s.revealGroup}>
              <ScratchHeart revealed={revealed} onReveal={() => setRevealed(true)} />
              {/* Fixed height so swapping the link for the countdown doesn't shift the heart. */}
              <div className={s.panelSlot}>
                {revealed ? (
                  <div className={s.panel}>
                    <Timer />
                  </div>
                ) : (
                  <button type="button" className={s.revealLink} onClick={() => setRevealed(true)}>
                    or tap to reveal
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Just below the arch, not inside it — inside, it sat on the plinth line.
            The slot is always there so revealing doesn't shift the arch. */}
        <div className={s.calSlot}>{revealed && <CalendarButton />}</div>
        <a href="#moments" className={s.moreHint}>
          Our moments
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </a>
      </section>

      <Gallery onReplay={onReplay} />
    </main>
  );
}

// Mughal arch, viewBox 0 0 100 160 — the container has the same 10:16 aspect,
// so nothing distorts. pathLength=1 lets the CSS "draw" each line in.
function Arch() {
  return (
    <svg className={s.archSvg} viewBox="0 0 100 160" aria-hidden>
      <path
        pathLength={1}
        className={s.archOuter}
        d="M3 160V64C3 41 16 27 34 20C42 17 47 14 50 9C53 14 58 17 66 20C84 27 97 41 97 64V160"
      />
      <path
        pathLength={1}
        className={s.archInner}
        d="M6.5 160V65C6.5 44 18.5 31 35.5 24.5C43 21.5 47.5 18.5 50 14.5C52.5 18.5 57 21.5 64.5 24.5C81.5 31 93.5 44 93.5 65V160"
      />
      <path
        className={s.archDots}
        d="M10 158V66C10 47 21 35 37 29C44 26 48 23.5 50 20.5C52 23.5 56 26 63 29C79 35 90 47 90 66V158"
      />
      {/* Plinth the arch stands on. */}
      <path pathLength={1} className={s.archOuter} d="M0 159.6H100" />
      <path pathLength={1} className={s.archInner} d="M1.5 157.6H98.5" />
      {/* Kalash finial on the apex. */}
      <g className={s.finial}>
        <path d="M50 1.2c1.3 1.7 1.3 3.2 0 4.9c-1.3-1.7-1.3-3.2 0-4.9z" />
        <path d="M47.6 7.2h4.8" />
      </g>
    </svg>
  );
}

// Heart outline (viewBox 0 0 100 90). Used for the CSS mask (scratch layer
// and ivory card beneath) and the visible hairline on top — one shape, three uses.
const HEART =
  "M50 88C20 66 0 48 0 26 0 11 11 0 25 0c11 0 20 6 25 15C55 6 64 0 75 0c14 0 25 11 25 26 0 22-20 40-50 62Z";
const HEART_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 90'><path d='${HEART}'/></svg>`,
)}")`;

function ScratchHeart({ revealed, onReveal }: { revealed: boolean; onReveal: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Ref, not an effect dependency — re-running the effect would repaint the cover.
  const onRevealRef = useRef(onReveal);
  useEffect(() => {
    onRevealRef.current = onReveal;
  });

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // Velvet cover in the palette's --cover-* colours (deep rose on maroon,
    // ruby on the green rollback palettes).
    const css = getComputedStyle(c);
    const g = ctx.createRadialGradient(
      width * 0.35,
      height * 0.3,
      4,
      width / 2,
      height / 2,
      width * 0.75,
    );
    g.addColorStop(0, css.getPropertyValue("--cover-1").trim());
    g.addColorStop(0.6, css.getPropertyValue("--cover-2").trim());
    g.addColorStop(1, css.getPropertyValue("--cover-3").trim());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(244, 234, 214, 0.12)";
    for (let y = 6; y < height; y += 11) {
      for (let x = (y / 11) % 2 ? 6 : 11.5; x < width; x += 11) {
        ctx.beginPath();
        ctx.arc(x, y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = css.getPropertyValue("--cover-ink").trim();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `italic 500 ${Math.round(height * 0.12)}px ${css.fontFamily}`;
    ctx.fillText("Scratch to Reveal", width / 2, height * 0.42);

    // Brush.
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(28, width * 0.16);

    let last: { x: number; y: number } | null = null;
    let strokes = 0;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // Share of the canvas cleared. The heart fills ~70% of its box and the
    // corners outside it are never scratched, so 0.4 here ≈ 55–60% of the heart.
    const cleared = () => {
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let clear = 0;
      let total = 0;
      for (let i = 3; i < data.length; i += 64) {
        total++;
        if (data[i] < 128) clear++;
      }
      return clear / total;
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x + 0.1, p.y);
      ctx.stroke();
      last = p;
      if (++strokes % 8 === 0 && cleared() > 0.4) onRevealRef.current();
    };
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      last = pos(e);
      move(e);
    };
    const up = () => {
      last = null;
      if (cleared() > 0.4) onRevealRef.current();
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div className={`${s.heart} ${revealed ? s.heartRevealed : ""}`}>
      <div className={s.heartFill} style={{ maskImage: HEART_MASK, WebkitMaskImage: HEART_MASK }}>
        <div className={s.heartDate} aria-live="polite">
          <span className={s.weekday}>{WEDDING.weekdayLabel}</span>
          <span className={s.dateDay}>8 December</span>
          <span className={s.dateYear}>2027</span>
        </div>
        <canvas
          ref={canvas}
          className={`${s.scratchCanvas} ${revealed ? s.scratchGone : ""}`}
          aria-hidden
        />
      </div>
      <svg className={s.heartLine} viewBox="-2 -2 104 94" aria-hidden>
        <path d={HEART} />
      </svg>
    </div>
  );
}

// ─── Gallery ───────────────────────────────────────────────────────────────

function Gallery({ onReplay }: { onReplay: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<string | null>(null);

  function show(src: string) {
    setOpen(src);
    dialog.current?.showModal();
  }

  return (
    <section id="moments" className={s.gallery}>
      <p className={s.eyebrow}>Our moments</p>
      <Divider />
      <div className={s.grid}>
        {PHOTOS.map((p) => (
          <button
            key={p.src}
            type="button"
            className={s.tile}
            onClick={() => show(p.src)}
            aria-label="View photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- plain static files, lazily loaded */}
            <img src={p.src} alt="" width={p.w} height={p.h} loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      {/* Native <dialog>: focus trap, Esc to close and a backdrop for free. */}
      <dialog
        ref={dialog}
        className={s.lightbox}
        onClick={() => dialog.current?.close()}
        onClose={() => setOpen(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
        {open && <img src={open} alt="" />}
      </dialog>
      <button type="button" className={s.replayLink} onClick={onReplay}>
        Watch the opening again
      </button>
    </section>
  );
}

function Timer() {
  const [left, setLeft] = useState<Countdown>(() => countdown(new Date()));
  useEffect(() => {
    const id = setInterval(() => setLeft(countdown(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  const cells: [number, string][] = [
    [left.days, "Days"],
    [left.hours, "Hours"],
    [left.minutes, "Minutes"],
    [left.seconds, "Seconds"],
  ];
  return (
    <div className={s.timer} role="timer" aria-label="Countdown to the wedding">
      {cells.map(([n, label]) => (
        <div key={label} className={s.timerCell}>
          <span className={s.tileNum}>{label === "Days" ? n : String(n).padStart(2, "0")}</span>
          <span className={s.tileLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function CalendarButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.cal}>
      <button
        type="button"
        className={s.calBtn}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        Add to calendar
      </button>
      {open && (
        <div className={s.calMenu} role="menu">
          <a role="menuitem" href={ICS_PATH} onClick={() => setOpen(false)}>
            Apple Calendar
          </a>
          <a
            role="menuitem"
            href={googleCalendarUrl()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            Google Calendar
          </a>
        </div>
      )}
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {muted ? (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      ) : (
        <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
      )}
    </svg>
  );
}

// ─── Music ─────────────────────────────────────────────────────────────────
// A royalty-free track (Pixabay licence: free, no attribution required) served
// from public/. Loops, fades in over 3s. iOS ignores HTMLAudioElement.volume,
// so the fade goes through a Web Audio gain node. If the file is missing or
// playback is refused, the page simply stays silent.

// First 1:10 of the track (fade-out at the end so the loop restarts cleanly),
// AAC at 96 kbps (~850 KB) — re-encoded from the 256 kbps MP3 download.
const MUSIC_SRC = "/save-the-date/music.m4a";
const MUSIC_VOLUME = 0.8;
// Seconds into the track where it swells. Playback starts this far minus
// T.doorsOpen into the file, so the doors swing open on the swell.
const MUSIC_PEAK_AT = 16;

type Music = { setMuted: (m: boolean) => void; stop: () => void };

function startMusic(offsetSeconds: number): Music {
  const el = new Audio(MUSIC_SRC);
  el.loop = true;
  // Seek once the file's length is known, adding however long loading took,
  // so the music stays in step with the animation clock started by the tap.
  const tappedAt = performance.now();
  el.addEventListener(
    "loadedmetadata",
    () => {
      el.currentTime = Math.max(0, offsetSeconds + (performance.now() - tappedAt) / 1000);
    },
    { once: true },
  );

  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = AC ? new AC() : null;
  if (ctx) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, ctx.currentTime + 3);
    ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);
  }
  el.play().catch(() => {});

  let muted = false;
  const onVis = () => {
    if (document.hidden) el.pause();
    else if (!muted) el.play().catch(() => {});
  };
  document.addEventListener("visibilitychange", onVis);

  return {
    setMuted(m) {
      muted = m;
      if (m) el.pause();
      else {
        ctx?.resume();
        el.play().catch(() => {});
      }
    },
    stop() {
      document.removeEventListener("visibilitychange", onVis);
      el.pause();
      ctx?.close();
    },
  };
}
