"use client";

import { useEffect, useRef, useState } from "react";
import type { MotionValue } from "motion/react";
import manifest from "@/lib/frame-manifest.json";
import { frameDockFactor, frameIndex, frameWindow, MAX_DECODED_FRAMES } from "@/lib/timeline";

export function FrameSequence({ progress }: { progress: MotionValue<number> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (failed) return;
    const context = canvas.current?.getContext("2d", { alpha: true });
    const surface = canvas.current?.parentElement;
    if (!context || !surface) { setFailed(true); return; }
    const ready = new Map<number, HTMLImageElement>();
    const loading = new Map<number, HTMLImageElement>();
    const unavailable = new Set<number>();
    let wanted = frameIndex(progress.get(), manifest.frames.length);
    let queue: number[] = [];
    let disposed = false;
    let raf = 0;
    let drawn = -1;

    const paint = () => {
      raf = 0;
      if (disposed || ready.size === 0) return;
      const nearest = ready.has(wanted) ? wanted : [...ready.keys()].reduce((a, b) => Math.abs(a - wanted) <= Math.abs(b - wanted) ? a : b);
      if (drawn === nearest) return;
      context.clearRect(0, 0, manifest.width, manifest.height);
      context.drawImage(ready.get(nearest)!, 0, 0, manifest.width, manifest.height);
      // Position and pixels change in the same RAF, including during fast reverse scrolling.
      const dock = frameDockFactor(nearest, manifest.bottomEdges, manifest.height);
      surface.style.transform = `translateY(calc((50dvh - 50%) * ${dock}))`;
      context.canvas.dataset.frame = String(nearest);
      drawn = nearest;
    };
    const schedulePaint = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const pump = () => {
      while (!disposed && loading.size < 2 && queue.length) {
        const index = queue.shift()!;
        if (ready.has(index) || loading.has(index) || unavailable.has(index)) continue;
        const image = new Image();
        image.decoding = "async";
        loading.set(index, image);
        image.onload = () => {
          if (disposed) return;
          loading.delete(index);
          ready.set(index, image);
          // A small sliding window stays decoded, not 41 full-size RGBA frames.
          while (ready.size > MAX_DECODED_FRAMES) {
            const farthest = [...ready.keys()].reduce((a, b) => Math.abs(a - wanted) >= Math.abs(b - wanted) ? a : b);
            ready.delete(farthest);
          }
          schedulePaint();
          pump();
        };
        image.onerror = () => {
          if (disposed) return;
          loading.delete(index);
          unavailable.add(index);
          if (index === wanted) setFailed(true);
          pump();
        };
        image.src = manifest.frames[index];
      }
    };
    const update = (value: number) => {
      const index = frameIndex(value, manifest.frames.length);
      const direction = index - wanted;
      wanted = index;
      if (unavailable.has(index)) { setFailed(true); return; }
      queue = frameWindow(index, manifest.frames.length, direction);
      pump();
      schedulePaint();
    };
    update(progress.get());
    const unsubscribe = progress.on("change", update);
    return () => {
      disposed = true;
      unsubscribe();
      cancelAnimationFrame(raf);
      for (const image of loading.values()) { image.onload = null; image.onerror = null; }
      loading.clear();
      ready.clear();
    };
  }, [progress, failed]);
  return (
    <div className="sequence-art" style={failed ? { transform: "none" } : undefined} role="img" aria-label="Анимация: объёмная эмблема Билдерс собирается по мере прокрутки">
      {failed ? (
        // Assets are already resized WebP; a second image optimizer is unnecessary.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={manifest.frames.at(-1)} alt="" width={manifest.width} height={manifest.height} draggable={false} />
      ) : <canvas ref={canvas} width={manifest.width} height={manifest.height} aria-hidden="true" />}
    </div>
  );
}
