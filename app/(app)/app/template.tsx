"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Transition douce entre les pages de l'application (fondu + léger glissement). */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
