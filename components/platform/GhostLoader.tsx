"use client";

import { useEffect, useState, type ComponentType } from "react";

type LottieComponent = ComponentType<{ animationData: unknown; loop?: boolean; autoplay?: boolean; style?: React.CSSProperties }>;

const ANIMATION_URL = "/brand/ghost-loader.json";
const STATIC_URL = "/brand/ghost.png";

// One shared fetch so every loader on the page reuses the same animation JSON.
let animationPromise: Promise<unknown> | null = null;
function loadAnimation() {
  animationPromise ??= fetch(ANIMATION_URL).then((r) => {
    if (!r.ok) throw new Error("animation unavailable");
    return r.json();
  });
  animationPromise.catch(() => { animationPromise = null; });
  return animationPromise;
}

/**
 * The Marlo ghost. Plays the looped Lottie animation, and shows the static image instead when the user
 * prefers reduced motion or the animation (or lottie-react) fails to load.
 * Decorative by default (aria-hidden); pass `label` when the ghost is the only thing announcing something.
 */
export function GhostLoader({ size = 22, label, className }: { size?: number; label?: string; className?: string }) {
  const [Lottie, setLottie] = useState<LottieComponent | null>(null);
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let alive = true;
    Promise.all([import("lottie-react"), loadAnimation()])
      .then(([mod, json]) => {
        if (!alive) return;
        const m = mod as unknown as { default: unknown };
        const component = ((m.default as { default?: unknown })?.default ?? m.default) as LottieComponent;
        setData(json);
        setLottie(() => component);
      })
      .catch(() => { /* keep the static ghost */ });
    return () => { alive = false; };
  }, []);

  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  const box = { width: size, height: size };

  return (
    <span className={`ghost-loader${className ? ` ${className}` : ""}`} style={box} {...a11y}>
      {Lottie && data ? (
        <Lottie animationData={data} loop autoplay style={box} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={STATIC_URL} alt="" width={size} height={size} />
      )}
    </span>
  );
}
