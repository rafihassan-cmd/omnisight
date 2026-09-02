import React, { useEffect, useState } from 'react';
import './MarqueeSection.css';

import dataCleaningImg from '../../images/data cleaning.png';
import dataVisImg from '../../images/data visualization.jpg';
import statisticsImg from '../../images/statistics.jpg';

const SERVICE_CARDS = [
  { title: 'Clean Data',               desc: 'Automated data cleaning & validation for spotless datasets', imageSrc: dataCleaningImg },
  { title: 'Visualize Your Data',      desc: 'Interactive charts & rich visual dashboards',           imageSrc: dataVisImg },
  { title: 'Plot Results',             desc: 'Publication-ready plots & exportable figures',           imageSrc: dataVisImg },
  { title: 'Check Statistics',         desc: 'Comprehensive descriptive & inferential analysis',      imageSrc: statisticsImg },
  { title: 'Intelligence Summary',     desc: 'Deep analytical insights & executive narratives',        imageSrc: statisticsImg },
];

/**
 * MarqueeSection — Full-bleed background slideshow
 * Crossfades high-resolution background images with dark gradient overlays
 * and crisp typography in a 100vh layout.
 */
export default function MarqueeSection() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % SERVICE_CARDS.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="fullbleed-slideshow" aria-label="Our core services">
      {/* ── Slide Backgrounds & Overlays ── */}
      {SERVICE_CARDS.map((slide, index) => {
        const isActive = index === activeIdx;
        return (
          <div
            key={index}
            className={`fullbleed-slide ${isActive ? 'fullbleed-slide--active' : ''}`}
            aria-hidden={!isActive}
          >
            {/* Full-Bleed Background Image */}
            <img
              src={slide.imageSrc}
              alt=""
              className="fullbleed-slide__bg"
            />
            {/* Dark Scrim / Gradient Overlay for Text Legibility */}
            <div className="fullbleed-slide__overlay" />

            {/* Prominent Overlay Content */}
            <div className="fullbleed-slide__content">
              <h2 className="fullbleed-slide__title">{slide.title}</h2>
            </div>
          </div>
        );
      })}

      {/* ── Interactive Dots Navigation ── */}
      <div className="fullbleed-slide__dots" role="tablist" aria-label="Slide indicators">
        {SERVICE_CARDS.map((slide, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={index === activeIdx}
            aria-label={`Slide ${index + 1}: ${slide.title}`}
            className={`fullbleed-slide__dot ${index === activeIdx ? 'fullbleed-slide__dot--active' : ''}`}
            onClick={() => setActiveIdx(index)}
          />
        ))}
      </div>
    </section>
  );
}
