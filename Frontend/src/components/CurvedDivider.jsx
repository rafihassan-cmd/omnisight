import React from 'react';

/**
 * CurvedDivider
 * An SVG wave that sits between the dark hero and the cream footer section.
 * The fill colour matches the bottom section background.
 *
 * Props:
 *   fillColor  — should match your bottom section's bg-color (default: #f5f2eb)
 */
export default function CurvedDivider({ fillColor = '#f5f2eb' }) {
  return (
    <div
      style={{
        lineHeight: 0,
        overflow: 'hidden',
        flexShrink: 0,           /* don't let the wave get squeezed by flex */
        background: 'var(--color-bg-top)',
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 35"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', width: '100%', height: '35px' }}
      >
        <path
          d="
            M0,0
            C240,35 480,0 720,17
            C960,35 1200,0 1440,17
            L1440,35
            L0,35
            Z
          "
          fill={fillColor}
        />
      </svg>
    </div>
  );
}
