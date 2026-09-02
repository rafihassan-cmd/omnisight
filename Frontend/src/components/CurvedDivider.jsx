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
        marginTop: '-50px',      /* pull it slightly up behind the hero section */
        position: 'relative',
        zIndex: 0,
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 150"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', width: '100%', height: '150px' }}
      >
        <path
          d="
            M0,0
            Q720,150 1440,0
            L1440,150
            L0,150
            Z
          "
          fill={fillColor}
        />
      </svg>
    </div>
  );
}
