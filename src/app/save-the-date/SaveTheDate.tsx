"use client";

import { useEffect, useRef, useState } from "react";
import { ICS_PATH, WEDDING, countdown, googleCalendarUrl, type Countdown } from "@/lib/saveTheDate";
import s from "./saveTheDate.module.css";

// Emerald jharokha: emerald + antique gold + ivory, a Mughal arch frame, and a
// ruby heart to scratch. Story: an envelope waits in front of closed palace
// doors; it opens, drops away, the doors swing open onto the arch.

type Stage = "envelope" | "opening" | "open";

// When the envelope is unmounted after it has dropped away. The rest of the
// choreography lives in the CSS module (delays keyed off `.opened`).
const ENVELOPE_GONE_MS = 3400;

export function SaveTheDate({ classic = false }: { classic?: boolean }) {
  const [stage, setStage] = useState<Stage>("envelope");
  const [muted, setMuted] = useState(false);
  const music = useRef<Music | null>(null);

  useEffect(() => () => music.current?.stop(), []);

  function open() {
    if (stage !== "envelope") return;
    // Audio must start inside the tap itself or iOS keeps it silent.
    music.current ??= startMusic();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setStage("open");
    setStage("opening");
    setTimeout(() => setStage("open"), ENVELOPE_GONE_MS);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    music.current?.setMuted(next);
  }

  return (
    <div className={`${s.root} ${classic ? s.classic : ""} ${stage !== "envelope" ? s.opened : ""}`}>
      <Main />
      <Doors />
      {stage !== "open" && <Envelope opening={stage === "opening"} onOpen={open} />}
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
    </div>
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
            <path d="M0 47 L50 82 L100 47" className={s.laceLine} vectorEffect="non-scaling-stroke" />
            <path d="M0 44 L50 78.5 L100 44" className={s.laceDots} vectorEffect="non-scaling-stroke" />
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
    <svg className={s.beadwork} viewBox="0 0 100 40" preserveAspectRatio="xMidYMin slice" aria-hidden>
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
    <div className={s.doors} aria-hidden>
      <div className={`${s.door} ${s.doorL}`}>
        <i className={s.knob} />
      </div>
      <div className={`${s.door} ${s.doorR}`}>
        <i className={s.knob} />
      </div>
    </div>
  );
}

// ─── Main card ─────────────────────────────────────────────────────────────

function Main() {
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
          <ScratchHeart revealed={revealed} onReveal={() => setRevealed(true)} />
          {/* Fixed height so swapping the link for the countdown doesn't shift the heart. */}
          <div className={s.panelSlot}>
            {revealed ? (
              <div className={s.panel}>
                <Timer />
                <CalendarButton />
              </div>
            ) : (
              <button type="button" className={s.revealLink} onClick={() => setRevealed(true)}>
                or tap to reveal
              </button>
            )}
          </div>
        </div>
      </div>
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
const HEART = "M50 88C20 66 0 48 0 26 0 11 11 0 25 0c11 0 20 6 25 15C55 6 64 0 75 0c14 0 25 11 25 26 0 22-20 40-50 62Z";
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

    // Ruby velvet — emerald and ruby, the Mughal jewel pairing.
    const g = ctx.createRadialGradient(width * 0.35, height * 0.3, 4, width / 2, height / 2, width * 0.75);
    g.addColorStop(0, "#9b2240");
    g.addColorStop(0.6, "#701430");
    g.addColorStop(1, "#45081c");
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
    ctx.fillStyle = "rgba(244, 234, 214, 0.92)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const family = getComputedStyle(c).fontFamily;
    ctx.font = `italic 500 ${Math.round(height * 0.11)}px ${family}`;
    ctx.fillText("scratch to reveal", width / 2, height * 0.37);
    ctx.font = `italic ${Math.round(height * 0.09)}px ${family}`;
    ctx.fillText("the date", width / 2, height * 0.5);

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
        <div key={label} className={s.tile}>
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
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
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

type Music = { setMuted: (m: boolean) => void; stop: () => void };

function startMusic(): Music {
  const el = new Audio(MUSIC_SRC);
  el.loop = true;

  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
