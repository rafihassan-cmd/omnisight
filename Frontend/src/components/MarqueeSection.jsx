import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './MarqueeSection.css';

const SERVICE_CARDS = [
  { title: 'Clean data',               desc: 'Automated data cleaning & validation' },
  { title: 'Visualize your data',      desc: 'Interactive charts & rich dashboards' },
  { title: 'Plot results',             desc: 'Publication-ready plots & exports' },
  { title: 'Check statistics',         desc: 'Descriptive & inferential analysis' },
  { title: 'See intelligence summary', desc: 'AI-generated insights & narratives' },
];

/* ── Easing ── */
function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* ── Rounded rect path helper ── */
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,    y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

/**
 * createCardTexture
 * Landscape-oriented card (1000×240): wide and short so it fits in a
 * compact 140px stage without looking squeezed.
 * No images/emojis — bold title, muted description, teal accents.
 */
function createCardTexture(title, desc) {
  const CW = 1000, CH = 240;
  const canvas = document.createElement('canvas');
  canvas.width  = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');

  /* ── Card shadow ── */
  ctx.shadowColor   = 'rgba(0, 0, 0, 0.13)';
  ctx.shadowBlur    = 28;
  ctx.shadowOffsetY = 8;

  /* ── White card background ── */
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 14, 10, CW - 28, CH - 28, 20);
  ctx.fill();

  /* Reset shadow */
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;
  ctx.shadowOffsetY = 0;

  /* ── Left vertical teal accent bar ── */
  ctx.fillStyle = '#14b8a6';
  roundedRect(ctx, 14, 10, 7, CH - 28, 4);
  ctx.fill();

  /* ── Subtle border ── */
  ctx.strokeStyle = 'rgba(20, 184, 166, 0.2)';
  ctx.lineWidth   = 1.5;
  roundedRect(ctx, 14, 10, CW - 28, CH - 28, 20);
  ctx.stroke();

  /* ── Radial glow — bottom right ── */
  const grd = ctx.createRadialGradient(
    CW - 80, CH - 30, 0,
    CW - 80, CH - 30, 180
  );
  grd.addColorStop(0, 'rgba(74, 222, 128, 0.09)');
  grd.addColorStop(1, 'rgba(74, 222, 128, 0)');
  roundedRect(ctx, 14, 10, CW - 28, CH - 28, 20);
  ctx.fillStyle = grd;
  ctx.fill();

  /* ── Title ── */
  ctx.fillStyle = '#0f1f1a';
  ctx.font      = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
  ctx.fillText(title, 52, 105);

  /* ── Description ── */
  ctx.fillStyle = '#5a7065';
  ctx.font      = '32px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
  ctx.fillText(desc, 52, 155);

  /* ── Bottom accent pill ── */
  ctx.fillStyle = '#14b8a6';
  roundedRect(ctx, 52, 180, 80, 5, 3);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

/* ════════════════════════════════════════════════════════════
   MarqueeSection
   — Three.js runs inside a compact 140px-tall stage
   — cards are landscape (wide×short), sized to fit height
════════════════════════════════════════════════════════════ */
export default function MarqueeSection() {
  const mountRef  = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;   // ~140px

    /* ── Renderer ── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    /* ── Orthographic camera (pixel-space) ── */
    const scene  = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      -W / 2,  W / 2,
       H / 2, -H / 2,
      0.1, 10
    );
    camera.position.z = 1;

    /* ── Card geometry — height-constrained for compact stage ──
     *  Canvas aspect ratio = 1000/240 ≈ 4.167
     *  Drive size from stage height so the card never overflows vertically.
     */
    const CARD_H = H * 0.76;                               // 80% of 140px ≈ 106px
    const CARD_W = Math.min(CARD_H * (1000 / 240), W * 0.60); // maintain aspect, cap width
    const finalH = CARD_W * (240 / 1000);                  // recalc height after width cap

    const OFFSCREEN = W / 2 + CARD_W / 2 + 60;

    /* ── Pre-build textures ── */
    const textures = SERVICE_CARDS.map(c => createCardTexture(c.title, c.desc));
    const geo = new THREE.PlaneGeometry(CARD_W, finalH);

    /* Current card */
    let curIdx = 0;
    const curMat  = new THREE.MeshBasicMaterial({ map: textures[curIdx], transparent: true });
    const curMesh = new THREE.Mesh(geo, curMat);
    curMesh.position.set(0, 0, 0);
    scene.add(curMesh);

    /* Next card (parked off-screen right) */
    let nxtIdx = 1;
    const nxtMat  = new THREE.MeshBasicMaterial({ map: textures[nxtIdx], transparent: true, opacity: 0 });
    const nxtMesh = new THREE.Mesh(geo, nxtMat);
    nxtMesh.position.set(OFFSCREEN, 0, 0);
    scene.add(nxtMesh);

    /* ── Animation state ── */
    let isSliding  = false;
    let slideT     = 0;
    const SLIDE_DUR = 1.0;   // seconds for one slide
    const HOLD_DUR  = 3.2;   // seconds card is shown
    let holdTimer   = 0;
    let lastTime    = performance.now();

    const beginSlide = () => {
      if (isSliding) return;
      isSliding = true;
      slideT    = 0;
      nxtMesh.position.x  = OFFSCREEN;
      nxtMat.map          = textures[nxtIdx];
      nxtMat.opacity      = 0;
      nxtMat.needsUpdate  = true;
    };

    let rafId;

    const tick = () => {
      rafId = requestAnimationFrame(tick);

      const now = performance.now();
      const dt  = Math.min((now - lastTime) / 1000, 0.1);
      lastTime  = now;

      if (!isSliding) {
        holdTimer += dt;
        if (holdTimer >= HOLD_DUR) beginSlide();
      } else {
        slideT = Math.min(slideT + dt / SLIDE_DUR, 1);
        const e = easeInOutCubic(slideT);

        curMesh.position.x = -OFFSCREEN * e;
        curMat.opacity     = 1 - e * 0.35;

        nxtMesh.position.x = OFFSCREEN * (1 - e);
        nxtMat.opacity     = e;

        if (slideT >= 1) {
          isSliding  = false;
          holdTimer  = 0;
          curIdx     = nxtIdx;
          nxtIdx     = (nxtIdx + 1) % SERVICE_CARDS.length;

          curMesh.position.x = 0;
          curMat.map         = textures[curIdx];
          curMat.opacity     = 1;
          curMat.needsUpdate = true;

          nxtMesh.position.x = OFFSCREEN;
          nxtMat.opacity     = 0;

          setActiveIdx(curIdx);
        }
      }

      renderer.render(scene, camera);
    };

    tick();

    return () => {
      cancelAnimationFrame(rafId);
      textures.forEach(t => t.dispose());
      geo.dispose();
      curMat.dispose();
      nxtMat.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <section className="marquee-section" aria-label="Our core services">

      <div className="marquee-section__header">
        <h2 className="marquee-section__title">What we do</h2>
        <p className="marquee-section__sub">
          End-to-end data intelligence for your research pipeline
        </p>
      </div>

      <div ref={mountRef} className="threejs-stage" />

      <div className="slide-dots" role="tablist" aria-label="Slide indicators">
        {SERVICE_CARDS.map((card, i) => (
          <span
            key={i}
            role="tab"
            aria-selected={i === activeIdx}
            aria-label={`Slide ${i + 1}: ${card.title}`}
            className={`slide-dot ${i === activeIdx ? 'slide-dot--active' : ''}`}
          />
        ))}
      </div>

    </section>
  );
}
