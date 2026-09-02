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
        background: 'transparent',/* completely transparent background to let hero gradient show through */
        width: '100%',
        position: 'relative',
        zIndex: 1,
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 180"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', width: '100%', height: '180px', background: 'transparent' }}
      >
        <path
          d="
            M0,0
            Q720,180 1440,0
            L1440,180
            L0,180
            Z
          "
          fill={fillColor}
        />
      </svg>
    </div>
  );
}
