"use client";

import { AnimatePresence, motion } from "framer-motion";

const STEPS = [
  "Fetching market data",
  "Parsing schema",
  "Loading forecast",
  "Computing probability",
  "Running gates",
  "Generating AI summary",
] as const;

export default function LoadingStepper({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="weather-stepper" role="status" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {STEPS.map((step, idx) => {
          const state = idx < activeIndex ? "done" : idx === activeIndex ? "active" : "todo";
          return (
            <motion.div
              layout
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className={`weather-step weather-step--${state}`}
            >
              <span className="weather-step__dot" />
              <span>{idx + 1}. {step}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
