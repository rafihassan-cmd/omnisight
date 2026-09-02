# OmniSight AI Data Workbench - Frontend Context Guide

This document is designed to provide comprehensive context to any LLM or developer picking up the OmniSight frontend project. It details the exact technology stack, the file structure, the design philosophy, and a chronological breakdown of how the UI was implemented.

## 1. Technology Stack

The project transitioned away from a Streamlit proof-of-concept to a custom, high-performance web frontend.

*   **Core Framework**: React 19 (scaffolded via Vite)
*   **Styling**: Pure Vanilla CSS (no Tailwind or CSS-in-JS). Uses a robust CSS Custom Properties (variables) system defined in `index.css` for consistent design tokens (colors, spacing, typography, border-radii).
*   **3D Graphics / Animations**: Three.js (`three` ^0.185.1). Used specifically for the "What we do" bottom slideshow section to render GPU-accelerated, animated WebGL cards.
*   **Routing / State**: Currently a single-page layout with state lifted to `App.jsx`. No external router or state manager is installed yet (to keep it lightweight for backend integration), but it is structured to easily accept React Router or Zustand if needed.

## 2. Component Architecture & File Structure

```text
omnisight/
├── index.html                   # Entry point, sets Google Fonts and basic meta tags
├── package.json                 # Dependencies (react, react-dom, three)
├── vite.config.js               # Dev server configuration
└── src/
    ├── main.jsx                 # React root render
    ├── App.jsx                  # Main layout container and state owner
    ├── App.css                  # Layout styling (100vh split, hero backdrop)
    ├── index.css                # Global CSS variables, resets, and typography
    └── components/
        ├── HeroHeader.jsx       # The OmniSight Logo & Slogan
        ├── HeroHeader.css
        ├── TaskSelector.jsx     # The 3 glassmorphic cards with clickable task pills
        ├── TaskSelector.css
        ├── FileUploader.jsx     # Drag-and-drop / click-to-browse file input zone
        ├── FileUploader.css
        ├── CurvedDivider.jsx    # SVG wavy line separating the Hero and Marquee sections
        ├── MarqueeSection.jsx   # Three.js driven slideshow ("What we do" section)
        └── MarqueeSection.css
```

## 3. Implementation Details & Design Decisions

### Phase 1: The aesthetic & Layout
*   **Theme**: Dark, premium aesthetic. The background uses layered linear gradients (dark greens) combined with large, blurred radial gradients (orange and green "orbs") to create an ambient, glowing effect.
*   **Typography**: Uses `Inter` for regular text and `Outfit` for display headings to look modern and crisp.
*   **Single Viewport Design (No-Scroll)**: The entire application is architected to fit exactly within a single `100vh` viewport, meaning the user never has to scroll down.
    *   The `omnisight-root` is set to `height: 100vh`, `display: flex`, `flex-direction: column`, `overflow: hidden`.
    *   The `hero-section` uses `flex: 1 1 0` to dynamically absorb all remaining vertical space above the bottom section.
    *   The `marquee-section` at the bottom is a fixed-height, compact panel (`~205px` tall).
    *   Component paddings, font sizes, and gaps are clamped and tightly controlled to ensure it fits comfortably within constraints like a `1536x730px` monitor.

### Phase 2: Core Components
*   **TaskSelector**: Three glassmorphic cards (`backdrop-filter: blur(12px)`, translucent borders). Inside are "pill" buttons for selecting specific analysis tasks (e.g., Clean data, Check statistics). Emojis were explicitly stripped out to maintain a sleek, professional look.
*   **FileUploader**: A custom dashed-border dropzone. Uses React's `onDragOver`, `onDragLeave`, and `onDrop` synthetic events. It also hides a native `<input type="file" />` triggered via a `<label>` wrapper for the click-to-browse fallback. The layout is horizontal to save vertical space.

### Phase 3: The Three.js Slideshow (MarqueeSection)
*   **Objective**: Replace a previous Framer Motion scrolling marquee with a specialized, single-card, one-at-a-time slide animation using pure WebGL for buttery smooth 60fps rendering.
*   **Mechanism**:
    1.  Calculates container dimensions (`~140px` tall).
    2.  Creates an `OrthographicCamera` mapping pixels exactly 1:1.
    3.  `createCardTexture()` generates a `CanvasTexture` (HTML5 2D Canvas drawing) consisting of a white rounded rectangle, a teal accent bar, title, description, and subtle shadows. The design is explicitly "landscape" (`1000x240`) to look good when heavily vertically constrained.
    4.  Two meshes exist: `curMesh` (currently sliding out) and `nxtMesh` (currently sliding in).
    5.  A `requestAnimationFrame` loop manages sliding the meshes along the X-axis using an `easeInOutCubic` timing function.
    6.  Opacity cross-fading occurs during the transition.
    7.  Slide duration is 1s, hold duration is 3.2s.

## 4. Backend Integration Guide (FastAPI Ready)

The frontend is strictly presentation-focused but wired explicitly for a backend developer to hook into.

**Integration Point:** `src/App.jsx` -> `handleAnalyze()`

1.  **State Available**:
    *   `file` (State: `<File>` object | `null`): The user's uploaded dataset.
    *   `selectedTasks` (State: `Array<string>`): E.g., `["clean_data", "statistics"]`. IDs match those defined in `TaskSelector.jsx`.
2.  **Target Workflow**:
    *   Inside `handleAnalyze`, construct a `FormData` object.
    *   Append the `file`.
    *   Append `JSON.stringify(selectedTasks)`.
    *   Send a `fetch()` POST request to the FastAPI endpoint (e.g., `/api/analyze`).
3.  **Proxy configuration (Recommended)**: To avoid CORS issues during local dev, the backend dev should update `vite.config.js` to proxy `/api` paths to `http://localhost:8000`.

## 5. Summary of recent user directives successfully executed
*   Removed all emojis/icons from the UI.
*   Replaced `framer-motion` scrolling cards with a `Three.js` slide-in one-at-a-time mechanism.
*   Compressed the entire UI via CSS (reducing paddings, clamping font sizes, switching the file uploader to a horizontal layout, minimizing the SVG wave divider, condensing the Three.js stage) so that both the Hero and the Slideshow fit comfortably into a standard laptop viewport with absolutely no scrolling required.
