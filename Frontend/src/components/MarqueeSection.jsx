import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './MarqueeSection.css';

import dataCleaningImg from '../../images/data cleaning.png';
import dataVisImg from '../../images/data visualization.jpg';
import statisticsImg from '../../images/statistics.jpg';

const SERVICE_CARDS = [
  { title: 'Clean data',               desc: 'Automated data cleaning & validation', imageSrc: dataCleaningImg },
  { title: 'Visualize your data',      desc: 'Interactive charts & rich dashboards', imageSrc: dataVisImg },
  { title: 'Plot results',             desc: 'Publication-ready plots & exports',   imageSrc: dataVisImg },
  { title: 'Check statistics',         desc: 'Descriptive & inferential analysis',   imageSrc: statisticsImg },
  { title: 'See intelligence summary', desc: 'AI-generated insights & narratives',   imageSrc: statisticsImg },
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
 * drawCenteredText
 * Formats and draws title text centered within specified bounds.
 */
function drawCenteredText(ctx, text, centerX, centerY, maxWidth) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f1f1a';

  const words = text.split(' ');
  let fontSize = 64;
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;

  let lines = [text];
  if (ctx.measureText(text).width > maxWidth && words.length > 1) {
    if (words.length === 3) {
      lines = [words[0] + ' ' + words[1], words[2]];
    } else if (words.length === 2) {
      lines = [words[0], words[1]];
    } else {
      const mid = Math.ceil(words.length / 2);
      lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    }
  }

  for (const l of lines) {
    while (ctx.measureText(l).width > maxWidth && fontSize > 36) {
      fontSize -= 4;
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
    }
  }

  const lineHeight = fontSize * 1.25;
  const totalHeight = lines.length * lineHeight;
  const startY = centerY - (totalHeight / 2) + (lineHeight / 2);

  lines.forEach((line, i) => {
    ctx.fillText(line, centerX, startY + i * lineHeight);
  });

  ctx.restore();
}

/**
 * createCardTexture
 * Split-layout card (1250×480):
 *  • Left half: Centered task title text
 *  • Right half: Contain-fit task image with rounded borders & async loading
 */
function createCardTexture(title, desc, imageSrc) {
  const CW = 1250, CH = 480;
  const canvas = document.createElement('canvas');
  canvas.width  = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');

  /* ── Card shadow ── */
  ctx.shadowColor   = 'rgba(0, 0, 0, 0.13)';
  ctx.shadowBlur    = 56;
  ctx.shadowOffsetY = 16;

  /* ── White card background ── */
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 28, 20, CW - 56, CH - 56, 40);
  ctx.fill();

  /* Reset shadow */
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;
  ctx.shadowOffsetY = 0;

  /* ── Left vertical teal accent bar ── */
  ctx.fillStyle = '#14b8a6';
  roundedRect(ctx, 28, 20, 14, CH - 56, 8);
  ctx.fill();

  /* ── Subtle border ── */
  ctx.strokeStyle = 'rgba(20, 184, 166, 0.2)';
  ctx.lineWidth   = 3;
  roundedRect(ctx, 28, 20, CW - 56, CH - 56, 40);
  ctx.stroke();

  /* ── Radial glow — bottom right ── */
  const grd = ctx.createRadialGradient(
    CW - 160, CH - 60, 0,
    CW - 160, CH - 60, 360
  );
  grd.addColorStop(0, 'rgba(74, 222, 128, 0.09)');
  grd.addColorStop(1, 'rgba(74, 222, 128, 0)');
  roundedRect(ctx, 28, 20, CW - 56, CH - 56, 40);
  ctx.fillStyle = grd;
  ctx.fill();

  /* ── Left Side (Text): Centered in left half ── */
  const leftX = 52;
  const leftW = (CW - 56) * 0.48 - 24;
  const leftCenterX = leftX + leftW / 2;
  const centerY = CH / 2;

  drawCenteredText(ctx, title, leftCenterX, centerY, leftW);

  /* ── Canvas Texture for Three.js ── */
  const texture = new THREE.CanvasTexture(canvas);

  /* ── Right Side (Image): Async loading & contain fit ── */
  if (imageSrc) {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const renderImageToCanvas = () => {
      const rightX = 28 + (CW - 56) * 0.48;
      const rightY = 20;
      const rightW = (CW - 56) * 0.52;
      const rightH = CH - 56;

      const margin = 28;
      const boxX = rightX + margin;
      const boxY = rightY + margin;
      const boxW = rightW - margin * 2;
      const boxH = rightH - margin * 2;

      const imgAspect = img.width / img.height;
      const boxAspect = boxW / boxH;

      let drawW, drawH, drawX, drawY;
      if (imgAspect > boxAspect) {
        drawW = boxW;
        drawH = boxW / imgAspect;
        drawX = boxX;
        drawY = boxY + (boxH - drawH) / 2;
      } else {
        drawH = boxH;
        drawW = boxH * imgAspect;
        drawX = boxX + (boxW - drawW) / 2;
        drawY = boxY;
      }

      ctx.save();
      roundedRect(ctx, drawX, drawY, drawW, drawH, 18);
      ctx.clip();
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();

      /* Subtle image border */
      ctx.save();
      ctx.strokeStyle = 'rgba(20, 184, 166, 0.25)';
      ctx.lineWidth = 2;
      roundedRect(ctx, drawX, drawY, drawW, drawH, 18);
      ctx.stroke();
      ctx.restore();

      /* CRUCIAL STEP: Signal WebGL to upload updated canvas pixels to GPU */
      texture.needsUpdate = true;
    };

    img.onload = renderImageToCanvas;
    if (img.complete && img.naturalWidth !== 0) {
      renderImageToCanvas();
    }
    img.src = imageSrc;
  }

  return texture;
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

    /* ── Card geometry — scaled down for a balanced compact card ──
     *  Canvas aspect ratio = 1250/480 = 2.6
     */
    const CARD_H = Math.min(H * 0.70, 380);                   // reduced height cap
    const CARD_W = Math.min(CARD_H * (1250 / 480), W * 0.65); // reduced width cap
    const finalH = CARD_W * (480 / 1250);                     // recalc height after width cap

    const OFFSCREEN = W / 2 + CARD_W / 2 + 60;

    /* ── Pre-build textures ── */
    const textures = SERVICE_CARDS.map(c => createCardTexture(c.title, c.desc, c.imageSrc));
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
