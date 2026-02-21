# UI Enhancement Plan: Agent Memory Dashboard

> Prioritized list of 10 UI enhancements ranked by **wow-factor x ease-of-implementation**.
> All code is inline CSS/JS -- no npm, no CDN imports, works in an iframe sandbox.
> Synthesized from 21st.dev, Magic UI, and Aceternity UI research (see UI_COMPONENTS_21ST.md and UI_ANIMATIONS_21ST.md).

---

## Dashboard Context

- **Background:** `#0f172a` (dark slate)
- **Accent:** `#8B5CF6` (purple/violet)
- **Existing animations:** `live-pulse` (green dot), `shimmer` (loading skeletons), `slide-in-new` + `glow-pulse` (new memory cards), `fadeIn`, `slideIn`, `stats-highlight`
- **Rendering:** Vanilla JS DOM manipulation, no framework
- **Constraints:** Single HTML file, iframe-sandboxed (MCP Apps), no external dependencies

### Already Being Implemented (by ui-researcher-2 -- DO NOT DUPLICATE)

The following 3 effects are being added to widget.html directly:
1. **Aurora Background** -- CSS-only ambient background gradient
2. **Animated Gradient Text** on "Agent Memory" title -- CSS-only
3. **Enhanced Live Dot** with ping rings -- CSS-only

The 10 enhancements below are **additional** to those and should not conflict with them.

---

## Enhancement #1: Spotlight Card Effect (Mouse-following Radial Gradient)

**Priority:** P0 -- Must Have

**Description:** When hovering over a memory card, a soft radial gradient light follows the mouse cursor, creating an interactive spotlight effect inspired by Aceternity UI's Card Spotlight. This single enhancement transforms flat cards into something that feels alive.

**Where:** Every `.memory-card` element in the Memories tab.

**Visual Impact:** 9/10

**Implementation Effort:** 10 minutes

**Conflicts:** Complements the existing `:hover` transform/box-shadow on `.memory-card`. The spotlight is purely additive (uses `::before` pseudo-element).

**Ready-to-paste CSS:**
```css
/* ── Spotlight Card Effect ─────────────────────────────── */
.memory-card {
  position: relative;
  overflow: hidden;
}
.memory-card::before {
  content: '';
  position: absolute;
  top: var(--mouse-y, -100px);
  left: var(--mouse-x, -100px);
  width: 250px;
  height: 250px;
  background: radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 0;
}
.memory-card:hover::before {
  opacity: 1;
}
.memory-card > * {
  position: relative;
  z-index: 1;
}
```

**Ready-to-paste JS** (add at end of `<script>`):
```javascript
// ── Spotlight Card Effect ───────────────────────────────
document.getElementById('memoryList').addEventListener('mousemove', function(e) {
  var card = e.target.closest('.memory-card');
  if (!card) return;
  var rect = card.getBoundingClientRect();
  card.style.setProperty('--mouse-x', (e.clientX - rect.left) + 'px');
  card.style.setProperty('--mouse-y', (e.clientY - rect.top) + 'px');
});
```

---

## Enhancement #2: Animated Border Beam on New Memories

**Priority:** P0 -- Must Have

**Description:** When a new memory arrives via polling, a beam of light races around the card border before settling. Inspired by Magic UI's Border Beam component. Replaces the static glow-pulse with a dynamic, directional light sweep.

**Where:** `.memory-card.new-memory` elements (newly arrived memories).

**Visual Impact:** 9/10

**Implementation Effort:** 12 minutes

**Conflicts:** Replaces the existing `glow-pulse` keyframe animation on `.new-memory`. Must update the `new-memory` class definition. The `slide-in-new` animation is kept.

**Ready-to-paste CSS** (add `@property` declaration BEFORE the `<style>` block, or inside it for modern browsers):
```css
/* ── @property for animated angle (place at top of <style>) ── */
@property --beam-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

/* ── Border Beam for New Memories ──────────────────────── */
.memory-card.new-memory {
  animation: slide-in-new 0.4s ease-out;
  transform: scale(1.01);
  transition: all 0.5s ease;
}

.memory-card.new-memory::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 2;
  /* Use padding-box / border-box mask trick for border-only effect */
  padding: 2px;
  background: conic-gradient(
    from var(--beam-angle),
    transparent 0%,
    var(--glow-color-60, rgba(139,92,246,0.6)) 10%,
    transparent 20%
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  animation: beam-rotate 2s linear 2;
}

@keyframes beam-rotate {
  to { --beam-angle: 360deg; }
}
```

**Ready-to-paste JS** (fallback for @property registration):
```javascript
// ── Register beam angle property (JS fallback) ──────────
// CSS @property in <style> is preferred, but this ensures registration
(function() {
  try {
    CSS.registerProperty({
      name: '--beam-angle',
      syntax: '<angle>',
      inherits: false,
      initialValue: '0deg'
    });
  } catch(e) { /* Already registered via CSS or unsupported */ }
})();
```

**Alternative approach (pseudo-element spin fallback)** for browsers without @property:
```css
/* Fallback: spinning oversized conic-gradient behind card */
.memory-card.new-memory {
  position: relative;
  overflow: hidden;
}
.memory-card.new-memory::after {
  content: '';
  position: absolute;
  z-index: -1;
  left: -50%; top: -50%;
  width: 200%; height: 200%;
  background: conic-gradient(
    var(--glow-color-60, rgba(139,92,246,0.6)) 0deg 40deg,
    transparent 40deg 360deg
  );
  animation: spin 2s linear 2;
}
@keyframes spin { to { transform: rotate(1turn); } }
```

---

## Enhancement #3: Animated Number Counters in Stats Bar

**Priority:** P0 -- Must Have

**Description:** When stats update, numbers count up/down with a smooth interpolation instead of instantly changing. Inspired by animated counter components from Magic UI. Makes the footer feel dynamic and data-driven.

**Where:** `.stats-bar` footer -- the `#statMemories`, `#statAgents`, `#statActions` spans.

**Visual Impact:** 7/10

**Implementation Effort:** 8 minutes

**Conflicts:** Works alongside existing `stats-flash` animation. The flash provides color pop, the counter provides number animation.

**Ready-to-paste JS:**
```javascript
// ── Animated Number Counters ────────────────────────────
var counterState = { memories: 0, agents: 0, actions: 0 };

function animateCounter(element, start, end, suffix, duration) {
  if (start === end) return;
  var range = end - start;
  var startTime = null;
  duration = duration || 400;

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var progress = Math.min((timestamp - startTime) / duration, 1);
    // Ease out cubic
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = Math.round(start + range * eased);
    element.textContent = current + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Override updateStats to use animated counters
var _origUpdateStats = updateStats;
updateStats = function(flash) {
  var agents = {};
  memories.forEach(function(m) { if (m.agent_id) agents[m.agent_id] = true; });
  var agentCount = Object.keys(agents).length;
  var actionCount = activities ? activities.length : 0;

  var statMem = document.getElementById('statMemories');
  var statAg = document.getElementById('statAgents');
  var statAct = document.getElementById('statActions');

  animateCounter(statMem, counterState.memories, memories.length,
    ' memor' + (memories.length === 1 ? 'y' : 'ies'));
  animateCounter(statAg, counterState.agents, agentCount,
    ' agent' + (agentCount === 1 ? '' : 's'));
  animateCounter(statAct, counterState.actions, actionCount,
    ' action' + (actionCount === 1 ? '' : 's'));

  counterState.memories = memories.length;
  counterState.agents = agentCount;
  counterState.actions = actionCount;

  if (flash) {
    [statMem, statAg, statAct].forEach(function(s) {
      s.classList.remove('stats-flash');
      void s.offsetWidth;
      s.classList.add('stats-flash');
    });
  }
};
```

---

## Enhancement #4: Floating Particles Background

**Priority:** P0 -- Must Have

**Description:** Subtle, slow-moving particles float upward in the background, creating depth and a sense of a living system. Inspired by Magic UI's Particles component. Particles are tiny, semi-transparent dots that drift slowly -- ambient, not distracting.

**Where:** Behind all content in the `.app-root` container.

**Visual Impact:** 8/10

**Implementation Effort:** 12 minutes

**Conflicts:** None -- particles render behind content with low z-index. Uses a dedicated canvas element.

**Ready-to-paste JS:**
```javascript
// ── Floating Particles Background ───────────────────────
(function() {
  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.4;';
  document.body.insertBefore(canvas, document.body.firstChild);
  var ctx = canvas.getContext('2d');
  var particles = [];
  var PARTICLE_COUNT = 35;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function createParticle() {
    return {
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * 20,
      size: Math.random() * 2 + 0.5,
      speedY: -(Math.random() * 0.3 + 0.1),
      speedX: (Math.random() - 0.5) * 0.2,
      opacity: Math.random() * 0.5 + 0.1,
      hue: Math.random() > 0.7 ? 260 : 220  // purple or blue tint
    };
  }

  for (var i = 0; i < PARTICLE_COUNT; i++) {
    var p = createParticle();
    p.y = Math.random() * canvas.height; // spread initially
    particles.push(p);
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.speedX;
      p.y += p.speedY;
      if (p.y < -10) { particles[i] = createParticle(); continue; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = 'hsla(' + p.hue + ', 60%, 70%, ' + p.opacity + ')';
      ctx.fill();
    }
    requestAnimationFrame(animate);
  }
  animate();
})();
```

---

## Enhancement #5: Sliding Tab Indicator

**Priority:** P1 -- Should Have

**Description:** Instead of the tab underline instantly switching between "Memories" and "Activity", a smooth sliding indicator glides between tabs. Inspired by 21st.dev's animated underline tabs component. Small touch but signals premium craft.

**Where:** `.tabs-bar` -- adds an absolutely-positioned indicator element that transitions `left` and `width`.

**Visual Impact:** 6/10

**Implementation Effort:** 5 minutes

**Conflicts:** Replaces the `border-bottom` approach on `.tab-btn.active`. Remove `border-bottom-color` from `.tab-btn.active` and rely on the indicator div instead.

**Ready-to-paste CSS:**
```css
/* ── Sliding Tab Indicator ─────────────────────────────── */
.tabs-bar { position: relative; }
.tab-btn.active { border-bottom-color: transparent; }
#tabIndicator {
  position: absolute;
  bottom: 0;
  height: 2px;
  background: #8B5CF6;
  border-radius: 1px;
  transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}
```

**Ready-to-paste HTML** (add inside `.tabs-bar`, after the tab buttons):
```html
<div id="tabIndicator"></div>
```

**Ready-to-paste JS** (add at end of `<script>`):
```javascript
// ── Sliding Tab Indicator ───────────────────────────────
function moveTabIndicator(btn) {
  var indicator = document.getElementById('tabIndicator');
  if (!indicator || !btn) return;
  indicator.style.left = btn.offsetLeft + 'px';
  indicator.style.width = btn.offsetWidth + 'px';
}

// Override switchTab to include indicator movement
var _origSwitchTab = switchTab;
switchTab = function(tab) {
  _origSwitchTab(tab);
  var btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  moveTabIndicator(btn);
};

// Initialize indicator position on load
setTimeout(function() {
  var activeBtn = document.querySelector('.tab-btn.active');
  moveTabIndicator(activeBtn);
}, 100);
```

---

## Enhancement #6: Glassmorphism Type Filter Bar

**Priority:** P1 -- Should Have

**Description:** Transform the type filter bar into a frosted glass panel with blur backdrop, subtle border, and refined active states using glassmorphism. The active tab gets a soft glow. Inspired by glassmorphism cards from 21st.dev.

**Where:** `.type-filter` bar and `.type-tab` buttons.

**Visual Impact:** 6/10

**Implementation Effort:** 5 minutes

**Conflicts:** Overrides existing `.type-filter` background and `.type-tab.active` styles. No animation conflicts.

**Ready-to-paste CSS:**
```css
/* ── Glassmorphism Type Filter ─────────────────────────── */
.type-filter {
  background: rgba(30, 41, 59, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.type-tab {
  transition: all 0.25s ease;
  border: 1px solid transparent;
}

.type-tab.active {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.3);
  color: #c4b5fd;
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.15);
}

.type-tab:hover:not(.active) {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.15);
}
```

---

## Enhancement #7: Activity Timeline Pulse Animation

**Priority:** P1 -- Should Have

**Description:** Activity timeline dots pulse with the agent's color when they first appear, and the timeline line has a subtle gradient fade. Makes the Activity tab feel as polished as the Memories tab.

**Where:** `.activity-item` elements in the Activity tab, specifically the `::before` pseudo-element dots and the left border.

**Visual Impact:** 6/10

**Implementation Effort:** 7 minutes

**Conflicts:** Extends the existing `.activity-item::before` styling. The `fade-in` animation on `.activity-item` is preserved.

**Ready-to-paste CSS:**
```css
/* ── Activity Timeline Pulse ───────────────────────────── */
.activity-item {
  border-image: linear-gradient(to bottom, currentColor 0%, #334155 100%) 1;
  border-left-width: 2px;
  border-left-style: solid;
}

.activity-item::before {
  content: '';
  position: absolute;
  left: -5px;
  top: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 0 currentColor;
  animation: timeline-pulse 2s ease-out 1;
}

@keyframes timeline-pulse {
  0% {
    box-shadow: 0 0 0 0 currentColor;
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 8px 4px currentColor;
    transform: scale(1.3);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
    transform: scale(1);
  }
}

.activity-item.fade-in {
  animation: slideIn 0.4s ease-out, fadeIn 0.4s ease-out;
}
```

---

## Enhancement #8: Search Input Focus Glow

**Priority:** P1 -- Should Have

**Description:** When the search input is focused, it gets an expanding purple glow ring and the placeholder text fades out with a slide-up animation. Adds polish to a frequently-used interaction.

**Where:** `.search-input` element in the header.

**Visual Impact:** 5/10

**Implementation Effort:** 4 minutes

**Conflicts:** Extends existing `.search-input:focus` style (which only changes `border-color`). Purely additive.

**Ready-to-paste CSS:**
```css
/* ── Search Focus Glow ─────────────────────────────────── */
.search-input {
  transition: border-color 0.2s ease, box-shadow 0.3s ease, width 0.3s ease;
}

.search-input:focus {
  border-color: #8B5CF6;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15), 0 0 20px rgba(139, 92, 246, 0.1);
  width: 220px;
}
```

---

## Enhancement #9: Staggered Card Entry Animation

**Priority:** P2 -- Nice to Have

**Description:** When memories first load or when switching type filters, cards cascade in with a staggered delay, each sliding up slightly after the previous. Creates a "waterfall" reveal effect.

**Where:** All `.memory-card` elements during initial render or filter change.

**Visual Impact:** 7/10

**Implementation Effort:** 8 minutes

**Conflicts:** The `fade-in` class is currently applied to non-new cards. This replaces it with a staggered version. Must not conflict with `new-memory` animation which has its own stagger logic.

**Ready-to-paste CSS:**
```css
/* ── Staggered Card Entry ──────────────────────────────── */
@keyframes card-cascade {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.memory-card.cascade-in {
  animation: card-cascade 0.35s ease-out both;
}
```

**Ready-to-paste JS** (modify `renderMemories` function -- add after `container.innerHTML = '';`):
```javascript
// In renderMemories, replace 'fade-in' with cascade stagger:
// Change this line:
//   var card = el('div', 'memory-card' + (isNew ? '' : ' fade-in'));
// To:
//   var card = el('div', 'memory-card' + (isNew ? '' : ' cascade-in'));
//   if (!isNew) card.style.animationDelay = (cascadeIdx * 40) + 'ms';
//   cascadeIdx++;

// Add at beginning of renderMemories (after container.innerHTML = ''):
// var cascadeIdx = 0;
```

**Complete integration -- replace the relevant lines in `renderMemories`:**
```javascript
// After: container.innerHTML = '';
var cascadeIdx = 0;

// Change the card creation line:
var card = el('div', 'memory-card' + (isNew ? '' : ' cascade-in'));
if (!isNew) {
  card.style.animationDelay = (cascadeIdx * 40) + 'ms';
  cascadeIdx++;
}
```

---

## Enhancement #10: Shimmer Badge on New Memories

**Priority:** P2 -- Nice to Have

**Description:** When a new memory arrives, its type badge gets a shimmering gradient sweep animation that draws the eye. Inspired by 21st.dev's Hero Badge component. A light sweep travels across the badge surface, making it sparkle briefly.

**Where:** `.badge` elements inside `.memory-card.new-memory` cards.

**Visual Impact:** 6/10

**Implementation Effort:** 4 minutes

**Conflicts:** None -- purely additive to existing `.badge` styles. The shimmer runs independently of the card's border-beam animation.

**Ready-to-paste CSS:**
```css
/* ── Shimmer Badge on New Memories ──────────────────────── */
@keyframes badge-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.memory-card.new-memory .badge {
  background: linear-gradient(
    90deg,
    var(--badge-bg, rgba(139,92,246,0.13)) 30%,
    rgba(255,255,255,0.15) 50%,
    var(--badge-bg, rgba(139,92,246,0.13)) 70%
  ) !important;
  background-size: 200% 100% !important;
  animation: badge-shimmer 1.5s ease-in-out 2;
}
```

**Ready-to-paste JS** (minor addition to renderMemories where badge is created):
```javascript
// Inside renderMemories, after creating the badge element for a new-memory card:
// Set --badge-bg to match the type color with transparency
if (isNew && mem.type) {
  var tc = TYPE_COLORS[mem.type] || '#6B7280';
  badge.style.setProperty('--badge-bg', tc + '22');
}
```

---

## Implementation Order

Note: Aurora background, animated gradient text, and enhanced live dot are already being implemented by ui-researcher-2 and are NOT in this table.

| Order | # | Enhancement | Priority | Minutes | Cumulative |
|-------|---|-------------|----------|---------|------------|
| 1 | 1 | Spotlight Card Effect | P0 | 10 | 10 |
| 2 | 4 | Floating Particles | P0 | 12 | 22 |
| 3 | 3 | Animated Counters | P0 | 8 | 30 |
| 4 | 2 | Border Beam New Memories | P0 | 12 | 42 |
| 5 | 5 | Sliding Tab Indicator | P1 | 5 | 47 |
| 6 | 8 | Search Focus Glow | P1 | 4 | 51 |
| 7 | 6 | Glassmorphism Filter Bar | P1 | 5 | 56 |
| 8 | 7 | Activity Timeline Pulse | P1 | 7 | 63 |
| 9 | 9 | Staggered Card Entry | P2 | 8 | 71 |
| 10 | 10 | Shimmer Badge | P2 | 4 | 75 |

**Total estimated time: ~75 minutes** for all 10 enhancements (not counting the 3 already being implemented).
**P0 only: ~42 minutes** -- these 4 enhancements alone transform the demo.

---

## Integration Notes

1. **CSS additions** go inside the existing `<style>` block, after the current animations section (line ~237).
2. **JS additions** go at the end of the `<script>` block, before the closing `</script>` tag (line ~846).
3. **The `@property` declaration** for `--beam-angle` (Enhancement #2) should be placed outside the `<style>` block if using the CSS approach, or use the JS `CSS.registerProperty()` fallback shown.
4. **The particles canvas** (Enhancement #4) is inserted by JS at runtime -- no HTML changes needed.
5. **Override for `updateStats`** (Enhancement #3) must come after the original function definition.
6. **The spotlight mousemove listener** (Enhancement #1) uses event delegation on `#memoryList`, so it works for dynamically created cards.
7. **For Enhancement #9** (staggered cards), you need to modify two lines inside the existing `renderMemories` function rather than adding new code at the end.

---

## What NOT to Change

- The `live-dot` / `live-pulse` animation (green dot) -- being enhanced by ui-researcher-2
- The basic `shimmer` loading skeleton animation -- it's functional
- The overall layout structure -- it's well-organized
- The polling mechanism -- it's the backbone of live updates
- The `slide-in-new` animation -- it's kept and complemented by border-beam
- The aurora background -- being added by ui-researcher-2
- The animated gradient title text -- being added by ui-researcher-2

---

---

## Bonus: Quick Wins from Research (implement if time permits)

These are additional micro-enhancements discovered during research that each take under 3 minutes:

### B1: Floating Empty State Icon
The brain emoji gently bobs up and down when no memories exist.
```css
.empty-state .text-3xl {
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
```

### B2: Full-Page Mouse Spotlight Overlay
A very subtle radial gradient follows the mouse across the entire dashboard.
```css
/* Add a div#pageSpotlight as first child of .app-root */
#pageSpotlight {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background: radial-gradient(
    600px circle at var(--mx, 50%) var(--my, 50%),
    rgba(139,92,246,0.04), transparent 70%
  );
}
```
```javascript
document.addEventListener('mousemove', function(e) {
  var el = document.getElementById('pageSpotlight');
  if (el) {
    el.style.setProperty('--mx', e.clientX + 'px');
    el.style.setProperty('--my', e.clientY + 'px');
  }
});
```

### B3: Noise Texture Overlay
Adds a film-grain texture for premium depth. Pure CSS with inline SVG data URI.
```css
body::after {
  content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

### B4: Sliding Tab Indicator (PROMOTED to Enhancement #5)
Instead of instant border-bottom switch, the active indicator slides between tabs.
```css
.tabs-bar { position: relative; }
#tabIndicator {
  position: absolute; bottom: 0; height: 2px;
  background: #8B5CF6; border-radius: 1px;
  transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```
```javascript
function moveIndicator(btn) {
  var indicator = document.getElementById('tabIndicator');
  if (!indicator) return;
  indicator.style.left = btn.offsetLeft + 'px';
  indicator.style.width = btn.offsetWidth + 'px';
}
// Call moveIndicator(activeBtn) inside switchTab()
```

---

## Research Sources

- [21st.dev Component Registry](https://21st.dev) -- community UI components
- [Magic UI](https://magicui.design/docs/components) -- border-beam, shine-border, particles, number-ticker, animated-shiny-text
- [Aceternity UI](https://ui.aceternity.com/components) -- card-spotlight, aurora-background, glowing-effect, moving-border
- [21st.dev Animate UI](https://21st.dev/animate-ui) -- animation primitives
- [ibelick Animated Gradient Borders](https://ibelick.com/blog/create-animated-gradient-borders-with-css) -- @property technique
- [CSS-Tricks: Animating Number Counters](https://css-tricks.com/animating-number-counters/)
- [Frontend Masters: CSS Spotlight Effect](https://frontendmasters.com/blog/css-spotlight-effect/)

See also:
- `/docs/analysis/UI_COMPONENTS_21ST.md` -- detailed component catalog
- `/docs/analysis/UI_ANIMATIONS_21ST.md` -- detailed animation/effect catalog
