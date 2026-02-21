# 21st.dev UI Components Research for Agent Memory Dashboard

## Overview

[21st.dev](https://21st.dev) is a curated community registry of React/Tailwind UI components, featuring contributions from libraries like Aceternity UI, Magic UI, shadcn/ui, and Animate UI. This document catalogs components that could enhance the Agent Memory dashboard, with analysis of how each could be adapted for our **single-file, self-contained HTML widget** (no React, no build step).

**Dashboard context**: Dark theme (`#0f172a` background), slate color palette, purple accent (`#8B5CF6`), memory cards, activity timeline, search bar, tabs, type-filter pills, stats footer, loading skeletons.

---

## 1. Card Effects

### 1.1 Magic Card (Mouse-Tracking Spotlight)
- **Source**: [21st.dev/dillionverma/magic-card](https://21st.dev/dillionverma/magic-card)
- **Visual**: A radial gradient spotlight follows the mouse cursor within the card, creating a soft illumination effect. The glow fades in on hover (300ms transition) and resets when the mouse leaves.
- **CSS/JS Approach**: Uses `mousemove` event to track cursor position relative to the card. A `radial-gradient` is dynamically positioned at the cursor coordinates. Default gradient: 200px radius, `#262626` color, 0.8 opacity. An absolutely-positioned overlay div (`-inset-px`, `pointer-events: none`) renders the gradient on top of the card content.
- **Dashboard mapping**: Memory cards -- on hover, a subtle purple spotlight (`#8B5CF6` at low opacity) follows the cursor, giving each card a premium interactive feel.
- **Inline CSS/JS feasibility**: YES. Pure CSS + vanilla JS `mousemove` handler. No dependencies.
- **Implementation sketch**:
  ```css
  .memory-card { position: relative; overflow: hidden; }
  .memory-card .card-spotlight {
    position: absolute; inset: -1px; pointer-events: none;
    opacity: 0; transition: opacity 0.3s ease;
    border-radius: inherit;
  }
  .memory-card:hover .card-spotlight { opacity: 1; }
  ```
  ```javascript
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spotlight.style.background = `radial-gradient(200px circle at ${x}px ${y}px, rgba(139,92,246,0.12), transparent 80%)`;
  });
  ```

### 1.2 Card Spotlight (Aceternity)
- **Source**: [21st.dev/aceternity/card-spotlight](https://21st.dev/aceternity/card-spotlight)
- **Visual**: Similar to Magic Card but with a canvas-based dot matrix reveal effect underneath the spotlight. The spotlight uses `mask-image` with a `radial-gradient` to create a circular reveal.
- **CSS/JS Approach**: `mask-image: radial-gradient(350px circle at X Y, white, transparent 80%)` applied to a colored overlay. Mouse position tracked with motion values.
- **Dashboard mapping**: Could replace or enhance memory card hover. The mask approach is more performant than gradient background.
- **Inline CSS/JS feasibility**: YES for the mask approach. The canvas dot-matrix would add complexity.

### 1.3 Animated Glow Card
- **Source**: [21st.dev/easemize/animated-glow-card](https://21st.dev/easemize/animated-glow-card)
- **Visual**: Cards with animated glowing borders/backgrounds using blur filters. Multiple modes: rotate, pulse, breathe, colorShift, flowHorizontal.
- **CSS/JS Approach**: Animated CSS gradients (conic for rotate mode, radial for pulse/breathe, linear for flow) with `filter: blur()` and `pointer-events: none`. GPU-accelerated with `transform: translateZ(0)`.
- **Dashboard mapping**: New memory glow animation -- when a new memory arrives, the card could use a "breathe" glow in the agent's color before settling.
- **Inline CSS/JS feasibility**: YES. The rotate mode needs `@property` for smooth conic-gradient animation, but pulse/breathe modes work with standard radial-gradient keyframes.
- **Implementation sketch** (breathe mode):
  ```css
  @keyframes glow-breathe {
    0%, 100% { transform: scale(0.95); opacity: 0.4; }
    50% { transform: scale(1.05); opacity: 0.8; }
  }
  .new-memory .glow-layer {
    position: absolute; inset: -4px; border-radius: 12px;
    background: radial-gradient(ellipse at center, var(--agent-color), transparent 70%);
    filter: blur(12px); pointer-events: none;
    animation: glow-breathe 2s ease-in-out 3;
  }
  ```

### 1.4 Glowing Effect (Aceternity / Cursor-style)
- **Source**: [21st.dev/aceternity/glowing-effect](https://21st.dev/aceternity/glowing-effect)
- **Visual**: A luminous arc travels along the card border, following the cursor when nearby. Uses a `repeating-conic-gradient` with mask-composite to create the arc shape. Colors: pink (#dd7bbb), gold (#d79f1e), sage (#5a922c), slate (#4c7894).
- **CSS/JS Approach**: CSS custom properties (`--start`, `--active`, `--spread`, `--blur`) drive the conic-gradient angle. Mouse proximity detection triggers activation. `mask-composite: exclude` creates border-only effect.
- **Dashboard mapping**: Premium hover effect for memory cards. The "white" variant would work well on dark backgrounds.
- **Inline CSS/JS feasibility**: PARTIAL. The mask-composite technique works in CSS. Mouse proximity detection needs JS. Complex but achievable.

---

## 2. Border Effects

### 2.1 Shine Border (Magic UI)
- **Source**: [21st.dev/designali-in/shine-border](https://21st.dev/designali-in/shine-border)
- **Visual**: A radial gradient continuously rotates around the element border, creating a shine/sweep effect. Supports single or multi-color gradients.
- **CSS/JS Approach**: Uses `::before` pseudo-element with `background-size: 300% 300%` and animated `background-position`. `mask-composite: exclude` creates border-only effect. `will-change: background-position` for performance. Default duration: 14s.
- **Dashboard mapping**: Stats bar footer, header, or selected tab indicator. A subtle shine sweep adds polish.
- **Inline CSS/JS feasibility**: YES. Pure CSS animation with pseudo-elements.
- **Implementation sketch**:
  ```css
  @keyframes shine-pulse {
    0% { background-position: 0% 0%; }
    50% { background-position: 100% 100%; }
    100% { background-position: 0% 0%; }
  }
  .shine-border::before {
    content: ''; position: absolute; inset: 0; border-radius: inherit;
    padding: 1px;
    background: radial-gradient(transparent, transparent, #8B5CF6, transparent, transparent);
    background-size: 300% 300%;
    animation: shine-pulse 14s infinite linear;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    pointer-events: none;
  }
  ```

### 2.2 Animated Gradient Border (ibelick technique)
- **Source**: [ibelick.com/blog/create-animated-gradient-borders-with-css](https://ibelick.com/blog/create-animated-gradient-borders-with-css), featured on [21st.dev/ibelick/glow-effect](https://21st.dev/ibelick/glow-effect)
- **Visual**: A gradient border that smoothly rotates around the card using a conic-gradient with an animated angle.
- **CSS/JS Approach**: Uses CSS `@property` to define `--angle` as `<angle>` type, then animates it from `0deg` to `360deg`. The border uses `background: linear-gradient(bg) padding-box, linear-gradient(var(--angle), color1, color2) border-box` with `border-color: transparent`.
- **Dashboard mapping**: Active/selected memory card, or the search input focus state.
- **Inline CSS/JS feasibility**: YES. Pure CSS with `@property`.
- **Full implementation**:
  ```css
  @property --angle {
    syntax: "<angle>";
    initial-value: 0deg;
    inherits: false;
  }
  @keyframes border-rotate {
    to { --angle: 360deg; }
  }
  .active-border {
    border: 2px solid transparent;
    background: linear-gradient(#1e293b, #1e293b) padding-box,
                linear-gradient(var(--angle), #8B5CF6, #3B82F6) border-box;
    animation: border-rotate 4s linear infinite;
  }
  ```

### 2.3 Border Beam (Magic UI)
- **Source**: [magicui.design/docs/components/border-beam](https://magicui.design/docs/components/border-beam), also on [21st.dev](https://21st.dev/s/border)
- **Visual**: An animated beam of light travels along the border perimeter. Customizable gradient from `colorFrom` to `colorTo`.
- **CSS/JS Approach**: Uses conic-gradient with mask to create a small arc that rotates. The beam width and colors are configurable.
- **Dashboard mapping**: Live status indicator -- the header or stats bar could have a subtle beam traveling along its border when connected/polling.
- **Inline CSS/JS feasibility**: YES. Similar to animated gradient border but with a narrower arc.

### 2.4 Moving Border (Aceternity)
- **Source**: [ui.aceternity.com/components/moving-border](https://ui.aceternity.com/components/moving-border), [21st.dev/aceternity/moving-border](https://21st.dev/aceternity)
- **Visual**: A gradient arc moves around a button/container border. Uses `conic-gradient(#0ea5e9 20deg, transparent 120deg)` with rotation.
- **CSS/JS Approach**: An absolutely-positioned div with `conic-gradient` background is scaled up (10x) and rotated with `@keyframes` from `rotate(0deg)` to `rotate(-360deg)`. An inner `::after` covers the center, leaving only the border visible. Duration: ~10s per rotation.
- **Dashboard mapping**: Tab indicator, active type filter, or the live status indicator.
- **Inline CSS/JS feasibility**: YES. Pure CSS with pseudo-elements.

---

## 3. Background Effects

### 3.1 Mouse Spotlight Overlay
- **Source**: [frontendmasters.com/blog/css-spotlight-effect/](https://frontendmasters.com/blog/css-spotlight-effect/), concept from [21st.dev/aceternity/spotlight](https://21st.dev/aceternity)
- **Visual**: A subtle transparent circle follows the mouse across the page, creating a focused spotlight effect on dark backgrounds.
- **CSS/JS Approach**:
  ```css
  .spotlight {
    position: fixed; inset: 0; pointer-events: none;
    background: radial-gradient(
      600px circle at var(--mx, 50%) var(--my, 50%),
      rgba(139,92,246,0.04), transparent 70%
    );
  }
  ```
  ```javascript
  document.addEventListener('mousemove', (e) => {
    document.body.style.setProperty('--mx', e.clientX + 'px');
    document.body.style.setProperty('--my', e.clientY + 'px');
  });
  ```
- **Dashboard mapping**: Subtle full-page spotlight effect that follows the cursor across the entire dashboard. Very low opacity (0.03-0.05) so it's felt but not distracting.
- **Inline CSS/JS feasibility**: YES. Trivial to implement.

### 3.2 Noisy Gradient Background
- **Source**: [21st.dev/easemize/noisy-gradient-backgrounds](https://21st.dev/easemize/noisy-gradient-backgrounds)
- **Visual**: A gradient background with a film grain / noise texture overlay. Creates depth and premium feel.
- **CSS/JS Approach**: HTML5 Canvas generates noise pixels (`Math.random() * 255 * intensity`) on a repeating pattern tile (100px). The noise canvas is overlaid on a radial-gradient div with `pointer-events: none`.
- **Dashboard mapping**: App background -- instead of flat `#0f172a`, add a very subtle noise texture for depth.
- **Inline CSS/JS feasibility**: YES with canvas approach. Alternative: CSS SVG filter noise.
- **Simpler CSS-only approach**:
  ```css
  body::after {
    content: ''; position: fixed; inset: 0; pointer-events: none;
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  }
  ```

### 3.3 Background Beams (Aceternity)
- **Source**: [21st.dev/aceternity/background-beams](https://21st.dev/aceternity/background-beams)
- **Visual**: Multiple SVG curved paths with animated linear gradients create flowing, wave-like beams. Colors: cyan (#18CCFC), purple (#6344F5), magenta (#AE48FF).
- **CSS/JS Approach**: SVG with 48+ Bezier curve paths. Each path has a `linearGradient` animated with Framer Motion (x1/x2/y1/y2 shifting over 10-20s). Stroke: 0.5px width, 0.4 opacity.
- **Dashboard mapping**: Subtle background decoration behind the memory list. Would need simplification for inline use.
- **Inline CSS/JS feasibility**: PARTIAL. The SVG paths work inline, but animating 48 gradients needs CSS animations or requestAnimationFrame. Could simplify to 5-8 beams.

### 3.4 Flickering Grid (Magic UI)
- **Source**: [21st.dev/community/components/magicui/flickering-grid](https://21st.dev/community/components/magicui/flickering-grid/default)
- **Visual**: A grid pattern where individual cells flicker/pulse with varying opacity, creating a digital matrix effect.
- **Dashboard mapping**: Background texture alternative to noise. More techy/futuristic.
- **Inline CSS/JS feasibility**: MODERATE. Needs canvas or many DOM elements.

---

## 4. Tabs & Navigation

### 4.1 Expandable Tabs
- **Source**: [21st.dev/victorwelander/expandable-tabs](https://21st.dev/victorwelander/expandable-tabs)
- **Visual**: Tabs show only icons by default; clicking expands to show icon + label with smooth spring animation. Separator lines between tabs.
- **CSS/JS Approach**: Spring physics animation (0.6s duration, zero bounce). Selected tab animates `width` from 0 to auto, `opacity` from 0 to 1. Container: `rounded-2xl, border, bg-background, p-1, shadow-sm`. Uses `useOnClickOutside` to collapse.
- **Dashboard mapping**: The Memories/Activity tabs could use this pattern -- show icons by default, expand on click. Would save vertical space.
- **Inline CSS/JS feasibility**: YES. CSS transitions can approximate the spring physics.

### 4.2 Animated Underline Tabs
- **Source**: [21st.dev/community/components/k3menn/simple-tabs-with-underline-and-bold-font](https://21st.dev/community/components/k3menn/simple-tabs-with-underline-and-bold-font/default)
- **Visual**: Tab indicator (underline) smoothly slides between tabs when switching.
- **CSS/JS Approach**: An absolutely-positioned `::after` element transitions `left` and `width` to match the active tab's position. Uses `getBoundingClientRect()` to calculate target position.
- **Dashboard mapping**: Current tab bar. Instead of instant border-bottom switch, the indicator slides between tabs.
- **Inline CSS/JS feasibility**: YES. JS calculates position, CSS transitions the movement.
- **Implementation sketch**:
  ```css
  .tabs-bar { position: relative; }
  .tab-indicator {
    position: absolute; bottom: 0; height: 2px;
    background: #8B5CF6; border-radius: 1px;
    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  ```
  ```javascript
  function moveIndicator(btn) {
    const indicator = document.getElementById('tabIndicator');
    indicator.style.left = btn.offsetLeft + 'px';
    indicator.style.width = btn.offsetWidth + 'px';
  }
  ```

---

## 5. Numbers & Counters

### 5.1 Animated Number Ticker (Magic UI)
- **Source**: [21st.dev/s/animated-number-counter](https://21st.dev/s/animated-number-counter), [magicui.design/docs/components/number-ticker](https://magicui.design/docs/components/number-ticker)
- **Visual**: Numbers count up/down to target with spring animation. Each digit can independently animate (slot-counter style).
- **CSS/JS Approach**: React version uses Framer Motion's spring animation. For vanilla JS: `requestAnimationFrame` loop with easing function.
- **Dashboard mapping**: Stats bar (memory count, agent count, action count). When values change, they animate to the new number.
- **Inline CSS/JS feasibility**: YES. Pure JS with `requestAnimationFrame`.
- **Implementation sketch**:
  ```javascript
  function animateNumber(el, from, to, duration) {
    const start = performance.now();
    const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; // easeInOutCubic
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const value = Math.round(from + (to - from) * ease(progress));
      el.textContent = value;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  ```

---

## 6. Badges & Tags

### 6.1 Badge with Dot (shadcn)
- **Source**: [21st.dev/community/components/shadcn/badge/with-dot](https://21st.dev/community/components/shadcn/badge/with-dot)
- **Visual**: A badge/pill with a small colored dot indicator (e.g., green for active, yellow for pending).
- **Dashboard mapping**: Type badges on memory cards could include a dot indicator showing recency or activity status.
- **Inline CSS/JS feasibility**: YES. Pure CSS.

### 6.2 Hero Badge (Animated Announcement)
- **Source**: [21st.dev/Codehagen/hero-badge](https://21st.dev/Codehagen/hero-badge)
- **Visual**: A highlighted badge with gradient background, often with a shine/shimmer animation across it.
- **Dashboard mapping**: "New" indicator badge on recently created memories. A shimmer sweep draws attention.
- **Inline CSS/JS feasibility**: YES. CSS gradient animation.
- **Shimmer badge implementation**:
  ```css
  @keyframes badge-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .badge-new {
    background: linear-gradient(90deg, #8B5CF6 30%, #c4b5fd 50%, #8B5CF6 70%);
    background-size: 200% 100%;
    animation: badge-shimmer 2s ease-in-out infinite;
    color: white; border-radius: 9999px; padding: 1px 8px;
    font-size: 10px; font-weight: 500;
  }
  ```

---

## 7. Search Input

### 7.1 AI Input with Search
- **Source**: [21st.dev/community/components/kokonutd/ai-input-with-search](https://21st.dev/community/components/kokonutd/ai-input-with-search)
- **Visual**: A search input with AI-style glow on focus, expanding width, and suggestion dropdown.
- **Dashboard mapping**: Search input could have a focus glow animation and smooth width expansion.
- **Inline CSS/JS feasibility**: YES for the glow and width transition.
- **Enhancement for current search**:
  ```css
  .search-input:focus {
    border-color: #8B5CF6;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1), 0 0 20px rgba(139, 92, 246, 0.05);
    width: 240px; /* expand from 192px */
  }
  ```

---

## 8. Glass Morphism

### 8.1 Glassmorphism Card
- **Source**: [21st.dev/beratberkayg/glassmorphism-profile-card](https://21st.dev/beratberkayg/glassmorphism-profile-card/default)
- **Visual**: Frosted glass effect with `backdrop-filter: blur()`, semi-transparent background, subtle border.
- **Dashboard mapping**: Memory cards or filter bar could use glassmorphism for depth.
- **Inline CSS/JS feasibility**: YES. Pure CSS.
- **Implementation**:
  ```css
  .glass-card {
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(148, 163, 184, 0.1);
  }
  ```

### 8.2 Liquid Glass Effect
- **Source**: [21st.dev/s/liquid-glass](https://21st.dev/s/liquid-glass)
- **Visual**: Apple-style liquid glass effect with refraction/distortion.
- **Dashboard mapping**: Premium header or card effect.
- **Inline CSS/JS feasibility**: MODERATE. Requires SVG filters for full liquid effect.

---

## 9. Activity Feed & Timeline

### 9.1 Radial Orbital Timeline
- **Source**: [21st.dev/jatin-yadav05/radial-orbital-timeline](https://21st.dev/jatin-yadav05/radial-orbital-timeline)
- **Visual**: A circular/orbital timeline layout instead of vertical list.
- **Dashboard mapping**: Alternative activity view. Too complex for our widget scope.
- **Inline CSS/JS feasibility**: LOW. Very complex layout.

### 9.2 Activity Timeline Enhancement Patterns
From the 21st.dev component patterns, key improvements for our existing timeline:
- **Colored connector lines**: Instead of static `#334155` border-left, use agent-colored borders
- **Pulse dot on latest entry**: Add a pulsing dot animation on the most recent activity
- **Staggered entrance**: Each activity item slides in with increasing delay
- **Hover expansion**: Activities expand to show full details on hover

---

## 10. Loading States

### 10.1 Enhanced Skeleton Patterns
Our current shimmer is good, but 21st.dev patterns suggest:
- **Multi-row skeletons** with varied widths for more realistic placeholders
- **Subtle purple tint** in the shimmer gradient to match theme
- **Fade-out** when content loads (instead of instant swap)

### 10.2 Spinner/Loader Alternatives
- **Source**: [21st.dev/s/spinner-loader](https://21st.dev/s/spinner-loader)
- 21 spinner components available
- **Dashboard mapping**: Could replace skeleton with an elegant spinner for reconnection states

---

## 11. Empty States

### 11.1 Enhanced Empty State
- **Source**: [21st.dev/serafimcloud/empty-state](https://21st.dev/serafimcloud/empty-state)
- **Visual**: Illustrated empty states with subtle animations, clear CTAs.
- **Dashboard mapping**: The "No memories yet" state could be more visually rich with a subtle animation.
- **Enhancement**:
  ```css
  .empty-state .empty-icon {
    animation: float 3s ease-in-out infinite;
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }
  ```

---

## 12. Gradient Text
- **Source**: [21st.dev/DavidHDev/gradient-text](https://21st.dev/DavidHDev/gradient-text), [21st.dev/s/gradient-text](https://21st.dev/s/gradient-text)
- **Visual**: Text with animated gradient colors flowing through it. Optional animated border.
- **Dashboard mapping**: Header title "Agent Memory" could have a subtle gradient.
- **Inline CSS/JS feasibility**: YES.
- **Implementation**:
  ```css
  .gradient-title {
    background: linear-gradient(135deg, #e2e8f0, #8B5CF6, #3B82F6, #e2e8f0);
    background-size: 300% 300%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: gradient-flow 8s ease infinite;
  }
  @keyframes gradient-flow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  ```

---

## Priority Ranking for Implementation

### Tier 1 -- High Impact, Low Effort (Implement First)
| Component | Dashboard Area | Effort |
|-----------|---------------|--------|
| Animated Underline Tabs (4.2) | Tab bar | ~20 lines CSS/JS |
| Search Input Focus Glow (7.1) | Search bar | ~5 lines CSS |
| Animated Number Counter (5.1) | Stats footer | ~15 lines JS |
| Mouse Spotlight Overlay (3.1) | Full page background | ~10 lines CSS/JS |
| Empty State Float Animation (11.1) | Empty state | ~5 lines CSS |
| Badge Shimmer (6.2) | New memory badge | ~10 lines CSS |

### Tier 2 -- High Impact, Medium Effort
| Component | Dashboard Area | Effort |
|-----------|---------------|--------|
| Magic Card Spotlight (1.1) | Memory cards | ~30 lines CSS/JS |
| Animated Gradient Border (2.2) | Active card / search focus | ~15 lines CSS |
| Glassmorphism Cards (8.1) | Memory cards, filter bar | ~10 lines CSS |
| Noise Background Texture (3.2) | App background | ~5 lines CSS |
| Gradient Title Text (12) | Header | ~10 lines CSS |

### Tier 3 -- Premium Polish, Higher Effort
| Component | Dashboard Area | Effort |
|-----------|---------------|--------|
| Shine Border (2.1) | Header or stats bar | ~20 lines CSS |
| Border Beam (2.3) | Header live indicator | ~25 lines CSS |
| Animated Glow Card (1.3) | New memory animation | ~25 lines CSS |
| Glowing Effect / Cursor Arc (1.4) | Memory cards | ~40+ lines CSS/JS |
| Background Beams (3.3) | Background | ~50+ lines SVG/CSS |

### Tier 4 -- Consider but Likely Skip
| Component | Reason |
|-----------|--------|
| Expandable Tabs (4.1) | Only 2 tabs -- overkill |
| Radial Timeline (9.1) | Too complex, doesn't fit widget format |
| Liquid Glass (8.2) | Requires SVG filters, heavy |
| Flickering Grid (3.4) | Too distracting for a dashboard |

---

## Key Technical Constraints

1. **Single HTML file**: All CSS must be inline `<style>`, all JS must be inline `<script>`. No imports, no build step.
2. **No React/Framer Motion**: All animations must use vanilla CSS (`@keyframes`, transitions, `@property`) or vanilla JS (`requestAnimationFrame`, event listeners).
3. **Performance**: The widget polls every 3s and re-renders the memory list. Animations must not cause layout thrashing. Use `transform` and `opacity` for GPU-accelerated animations. Avoid animating `width`/`height`/`left`/`top`.
4. **Browser support**: `@property` works in all modern browsers (Chrome 85+, Firefox 128+, Safari 15.4+). `backdrop-filter` works everywhere. `mask-composite` has good support.
5. **Dark theme**: All effects must be designed for dark backgrounds. Use low-opacity glows (0.03-0.15) to avoid washing out content.

---

## Recommended Component Combinations

For maximum visual impact with minimum code:

1. **Subtle background**: Noise texture (CSS SVG) + mouse spotlight overlay
2. **Cards**: Glassmorphism base + Magic Card spotlight on hover + animated gradient border for new/selected
3. **Tabs**: Sliding underline indicator
4. **Stats**: Animated number counters with easing
5. **Search**: Focus glow with width expansion
6. **New memories**: Agent-colored glow breathe animation + shimmer badge
7. **Header**: Gradient text title + optional border beam for live indicator
8. **Empty states**: Floating icon animation

This combination would transform the dashboard from clean-but-basic to premium-feeling while staying under ~150 additional lines of CSS and ~50 lines of JS.
