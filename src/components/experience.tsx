"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { FrameSequence } from "./frame-sequence";
import { ScrollHint } from "./scroll-hint";
import { segmentProgress } from "@/lib/timeline";
import { useReducedMotionPreference } from "./use-reduced-motion";

export function Experience() {
  const section = useRef<HTMLElement>(null);
  const reduced = useReducedMotionPreference();
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  // Function transforms keep these effects on the canvas's measured JS timeline.
  const titleOpacity = useTransform(scrollYProgress, (p) => 1 - segmentProgress(p, 0.025, 0.15));
  const titleBlur = useTransform(scrollYProgress, (p) => `blur(${22 * segmentProgress(p, 0, 0.15)}px)`);
  const titleScale = useTransform(scrollYProgress, (p) => 1 + 0.035 * segmentProgress(p, 0, 0.15));
  const frameOpacity = useTransform(scrollYProgress, (p) => segmentProgress(p, 0.04, 0.15));
  return (
    <section ref={section} className="experience" aria-labelledby="hero-title">
      <header className="site-header flex items-center justify-center">
        <a href="#top" className="type-display transition-opacity hover:opacity-60" aria-label="Билдерс СЗ Продакшн — наверх">БИЛДЕРС СЗ ПРОДАКШН</a>
      </header>
      <div className="experience-sticky">
        <motion.div className="hero-title-wrap" style={{ opacity: titleOpacity, filter: titleBlur, scale: reduced ? 1 : titleScale }}>
          <h1 id="hero-title" className="hero-title type-display">UNDERГРАУНД STAЛZОНА</h1>
        </motion.div>
        <motion.div className="sequence-layer" style={{ opacity: frameOpacity }}>
          <FrameSequence progress={scrollYProgress} />
        </motion.div>
        <ScrollHint />
      </div>
    </section>
  );
}
