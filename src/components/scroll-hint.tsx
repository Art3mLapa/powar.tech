"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { IDLE_DELAY_MS } from "@/lib/timeline";
import { useReducedMotionPreference } from "./use-reduced-motion";

export function ScrollHint() {
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotionPreference();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      setVisible(false);
      if (window.scrollY < window.innerHeight * 0.35) timer = setTimeout(() => setVisible(true), IDLE_DELAY_MS);
    };
    reset();
    window.addEventListener("scroll", reset, { passive: true });
    return () => { clearTimeout(timer); window.removeEventListener("scroll", reset); };
  }, []);
  return (
    <motion.button className="scroll-hint type-display" type="button" aria-label="Прокрутить вниз к анимации" aria-hidden={!visible} tabIndex={visible ? 0 : -1}
      initial={false} animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 6 }} transition={{ duration: reduced ? 0 : 0.7 }}
      style={{ pointerEvents: visible ? "auto" : "none" }}
      onClick={() => window.scrollBy({ top: window.innerHeight * 0.8, behavior: reduced ? "instant" : "smooth" })}>
      (СКРОЛЛЬ ВНИЗ)
    </motion.button>
  );
}
