import React from 'react';
import './HeroHeader.css';

/**
 * HeroHeader
 * Renders the OmniSight logo text and slogan.
 * No API hooks needed – purely presentational.
 */
export default function HeroHeader() {
  return (
    <header className="hero-header">
      <div className="hero-header__logo">
        <span className="logo-omni">Omni</span>
        <span className="logo-sight">Sight</span>
      </div>
      {/* ── SLOGAN PLACEHOLDER ──
          Replace the text below with your actual slogan.
          You can also fetch it from an API endpoint if dynamic. */}
      <p className="hero-header__slogan">
        Your unified workspace for data & analytics
      </p>
    </header>
  );
}
