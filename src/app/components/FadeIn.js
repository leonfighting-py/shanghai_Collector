"use client";

import { useEffect, useState } from "react";

/**
 * Wraps children and fades them in after a configurable delay.
 * Uses inline transitionDuration and Tailwind's transition-opacity.
 */
export function FadeIn({
  children,
  delay = 0,
  duration = 1000,
  className = "",
  style = {},
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`transition-opacity ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transitionDuration: `${duration}ms`,
        transitionProperty: "opacity",
        transitionTimingFunction: "ease",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
