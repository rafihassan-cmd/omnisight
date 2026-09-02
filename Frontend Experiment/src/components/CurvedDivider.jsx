import React from 'react';

/**
 * CurvedDivider
 * An SVG oval curve that seamlessly extends the dark green hero gradient
 * down into a mask over the bottom full-bleed slideshow.
 *
 * Props:
 *   fillColor  — should match the bottom color of your hero gradient (#122820)
 */
export default function CurvedDivider({ fillColor = '#122820' }) {
  return (
    <div
      style={{
        lineHeight: 0,
        overflow: 'hidden',
        flexShrink: 0,
        background: 'transparent',
        width: '100%',
        position: 'relative',
        zIndex: 10,
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 180"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', width: '100%', height: '120px', background: 'transparent' }}
      >
        <path
          d="M0,0 L1440,0 L1440,10 Q720,180 0,10 Z"
          fill={fillColor}
        />
      </svg>
    </div>
  );
}
