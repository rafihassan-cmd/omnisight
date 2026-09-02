import React, { useState, useEffect } from 'react';
import './MarqueeSection.css';

const SLIDES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M4 20h16" />
      </svg>
    ),
    text: "Upload a CSV, JSON, or XLSX file and get a cleaned dataset in seconds."
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 14l4-5 3 3 5-7" />
      </svg>
    ),
    text: "Pick from smart-recommended charts, or switch to statistics on your own terms."
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
      </svg>
    ),
    text: "Ask for a plain-language summary — OmniSight explains outliers and trends for you."
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9h10M7 13h6" />
      </svg>
    ),
    text: "Export the full analysis as a polished PDF or HTML report, ready to share."
  }
];

export default function MarqueeSection() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % SLIDES.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="marquee-section" aria-label="Feature Slideshow">
      {/* Container Card */}
      <div className="card-container">
        {SLIDES.map((slide, i) => (
          <div
            key={i}
            className={`slide-content ${i === activeIdx ? 'slide-content--active' : ''}`}
          >
            <div className="slide-icon">{slide.icon}</div>
            <p className="slide-text">{slide.text}</p>
          </div>
        ))}
      </div>

      {/* Pill Indicator Dots */}
      <div className="slide-dots" role="tablist">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIdx(i)}
            className={`slide-dot ${i === activeIdx ? 'slide-dot--active' : ''}`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}