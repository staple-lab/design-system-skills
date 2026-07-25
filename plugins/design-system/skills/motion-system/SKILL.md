---
name: motion-system
description: Use when adding animation to a design system or choosing between Motion (motion.dev), GSAP and CSS - motion tokens, enter/exit transitions, layout animation, scroll choreography, reduced-motion handling, and performance. Triggers on "animation", "transition", "motion", "framer motion", "gsap", "prefers-reduced-motion".
---

# Motion system

Motion in a design system is not decoration — it is **feedback**. It tells the user that something responded, where a thing came from, and where it went. Judge every animation by whether removing it would make the interface harder to understand. If not, it is probably noise.

## Motion values are tokens

Durations and easings live in `tokens/primitive.tokens.json` and reach components as `var(--ds-duration-normal)` / `var(--ds-easing-emphasized)` like every other value. A hardcoded `0.3s ease-in-out` is the same defect as a hardcoded `#3b82f6`.

```
duration.instant  50ms    ·  fast 150ms  ·  normal 250ms  ·  slow 400ms  ·  slower 600ms
easing.standard  cubic-bezier(0.2, 0, 0, 1)
easing.emphasized cubic-bezier(0.05, 0.7, 0.1, 1)
easing.decelerate cubic-bezier(0, 0, 0, 1)      entering
easing.accelerate cubic-bezier(0.3, 0, 1, 1)    leaving
```

Two principles the numbers encode:

- **Exits are faster than entrances** (~0.8×). A user who dismissed something has already moved on; making them wait for the goodbye is the most common reason an interface feels sluggish.
- **Distance scales duration.** A tooltip appearing 4px away and a full-screen drawer should not share a duration. Small = fast.

Never `ease-in-out` for UI. It starts and ends slowly, which reads as hesitant. Enter with `decelerate` (fast start, gentle stop — it feels like it arrived), leave with `accelerate` (gentle start, fast exit — it feels like it left).

## Reduced motion — do this once, at the system level

`prefers-reduced-motion` is not optional and not per-component. For a meaningful number of users, parallax and large transforms cause actual nausea; for many more it is a preference they set deliberately.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

The blunt global rule is the right default because it cannot be forgotten. **`0.01ms`, not `0`** — a duration of zero prevents `animationend`/`transitionend` from firing, and any component that unmounts on that event will hang open forever.

Then reduce thoughtfully where it matters: keep opacity fades (they rarely trigger symptoms), drop movement and scale. "Reduced" means less motion, not no feedback — a state change with zero indication is its own usability problem.

```tsx
const shouldReduceMotion = useReducedMotion();   // Motion's hook
<motion.div
  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
/>
```

## What animates, and how

| Interaction | Technique | Duration |
|---|---|---|
| Hover / press / focus | CSS transition | `fast` |
| Dropdown, tooltip, popover | CSS keyframes on `[data-state]` | `normal` |
| Dialog, drawer, sheet | CSS or Motion (needs exit) | `slow` in, `normal` out |
| Accordion, disclosure | CSS grid `1fr`/`0fr` or `interpolate-size` | `normal` |
| List add / remove / reorder | Motion `AnimatePresence` + `layout` | `normal` |
| Item moving between containers | Motion `layoutId` | `normal` |
| Scroll choreography, pinning | GSAP ScrollTrigger | n/a |
| Page transition | View Transitions API, or Motion | `slow` |

**Reach for CSS first.** It runs on the compositor, needs no client boundary in RSC, and cannot be broken by a state bug. Escalate to JS only for the three things CSS genuinely cannot do: exit animations on unmount, layout animations (FLIP), and interruptible spring physics.

### Enter/exit from `data-state` — no JS at all

```css
.content[data-state='open']   { animation: enter var(--ds-duration-normal) var(--ds-easing-decelerate); }
.content[data-state='closed'] { animation: exit  var(--ds-duration-fast)   var(--ds-easing-accelerate); }
.content[data-side='top']     { transform-origin: bottom center; }

@keyframes enter { from { opacity: 0; transform: scale(0.96) translateY(-4px); } }
@keyframes exit  { to   { opacity: 0; transform: scale(0.96); } }
```

Radix and Base UI both keep the element mounted through the exit animation, so this works without `AnimatePresence`. The `transform-origin` line is what makes a popover appear to grow *out of* its trigger — a large perceived-quality difference for two lines.

### Motion (`motion/react`)

```tsx
import { motion, AnimatePresence } from 'motion/react';

<AnimatePresence>
  {items.map((item) => (
    <motion.li key={item.id} layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
    />
  ))}
</AnimatePresence>
```

`layout` is the standout feature — FLIP animation of position and size changes for free, including across containers with `layoutId`. Doing it by hand is genuinely hard. Note `motion` components need `"use client"` in an RSC app.

Feed Motion the **token values**, not new magic numbers. Export them once:

```ts
import { resolved } from '@/tokens/dist/tokens';
export const transitions = {
  fast:   { duration: 0.15, ease: [0.2, 0, 0, 1] },
  normal: { duration: 0.25, ease: [0.2, 0, 0, 1] },
  spring: { type: 'spring', stiffness: 400, damping: 30 },
} as const;
```

### GSAP

For choreography and scroll. Inside React, always `useGSAP` — it scopes the animations and handles cleanup, and without it Strict Mode's double-invoke leaves duplicate tweens running.

```tsx
import { useGSAP } from '@gsap/react';
useGSAP(() => {
  gsap.timeline({ scrollTrigger: { trigger: ref.current, start: 'top 80%', scrub: 1 } })
      .from('.card', { y: 40, opacity: 0, stagger: 0.08 });
}, { scope: ref });
```

Keep GSAP out of the component library itself. It belongs in the *product's* set-pieces; a design system component that depends on ScrollTrigger has coupled every consumer to a scroll library.

## Performance

- **Animate `transform` and `opacity` only.** They run on the compositor. Animating `width`, `height`, `top`, `left`, `margin` or `box-shadow` triggers layout or paint on every frame and drops the animation to the main thread.
- Height is the common exception people need. Use `grid-template-rows: 0fr → 1fr`, or `interpolate-size: allow-keywords` with `height: auto` where support allows — both beat measuring in JS.
- `will-change` is a last resort, applied just before the animation and removed after. Left on permanently it costs memory on every element that has it.
- Animating `box-shadow` is expensive; animate the `opacity` of a pseudo-element that holds the shadow instead.
- Budget: 60fps means 16ms per frame. If a list of 200 rows animates on mount, it will not hold — stagger a visible subset and let the rest appear.

## Rules

1. Motion values are tokens. No inline durations.
2. `prefers-reduced-motion` handled globally, refined locally.
3. CSS first; JS only for exit, layout and springs.
4. Nothing above 400ms unless the user asked for it.
5. Never animate something the user is trying to read or click. A moving target is a usability bug regardless of how good it looks.
6. Never block input on an animation. The next click must land during the transition.
7. Animation is state feedback, not entertainment — the second time a user sees it, only the information survives.
