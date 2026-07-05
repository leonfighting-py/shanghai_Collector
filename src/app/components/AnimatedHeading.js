"use client";

import { useEffect, useState } from "react";

/**
 * Splits text by \n into lines, then each line into individual characters.
 * Each character animates in with a staggered delay:
 *   delay = initialDelay + (lineIndex * lineLength * charDelay) + (charIndex * charDelay)
 *
 * Spaces are rendered as non-breaking spaces ( ).
 */
export function AnimatedHeading({
  text,
  charDelay = 30,
  initialDelay = 200,
  transitionMs = 500,
  className = "",
  style = {},
}) {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), initialDelay);
    return () => clearTimeout(timer);
  }, [initialDelay]);

  const lines = text.split("\n");

  return (
    <h1 className={className} style={style}>
      {lines.map((line, lineIndex) => {
        const chars = [...line];
        // Approximate total chars in this line for delay accumulation
        const lineLength = chars.length;

        return (
          <span
            key={lineIndex}
            style={{ display: "block" }}
            aria-hidden={false}
          >
            {chars.map((char, charIndex) => {
              const delay =
                lineIndex * lineLength * charDelay + charIndex * charDelay;

              return (
                <span
                  key={charIndex}
                  style={{
                    display: "inline-block",
                    opacity: started ? 1 : 0,
                    transform: started
                      ? "translateX(0)"
                      : "translateX(-18px)",
                    transition: `opacity ${transitionMs}ms ease, transform ${transitionMs}ms ease`,
                    transitionDelay: `${delay}ms`,
                    whiteSpace: "pre",
                  }}
                >
                  {char === " " ? " " : char}
                </span>
              );
            })}
          </span>
        );
      })}
    </h1>
  );
}
