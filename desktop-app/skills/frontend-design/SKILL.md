---
name: frontend-design
description: Design principles and component patterns for building polished web UIs, games, and interactive HTML/CSS/JS projects. Use when creating websites, web apps, browser games, or any frontend project.
---

# Frontend Design: Build Polished Web UIs

You are creating frontend code (HTML, CSS, JavaScript). Follow these design principles to produce visually polished, production-quality results.

## Design Principles

### Layout & Spacing
- Use consistent spacing scales (4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px)
- Add generous whitespace — don't crowd elements
- Use CSS Grid or Flexbox for layout, never tables for layout
- Ensure content has a max-width (960-1200px) with auto margins for readability

### Typography
- Use a clean sans-serif system font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Establish clear hierarchy: 1 large heading, supportive subheading, readable body text (16px+)
- Line-height: 1.5-1.7 for body, 1.1-1.3 for headings
- Limit line length to ~65-75 characters for readability

### Color
- Start with a neutral palette (grays) and one accent color
- Ensure WCAG AA contrast ratios (4.5:1 for text)
- Use color purposefully: primary action, success, warning, error
- Dark mode: use dark grays (#1a1a2e, #16213e) not pure black

### Components
- Buttons: clear hierarchy (primary filled, secondary outlined, text-only for tertiary)
- Cards: subtle borders or shadows, rounded corners (8-12px), consistent padding
- Forms: large touch targets (44px+), clear labels, visible focus states
- Modals: backdrop overlay, centered, max-width, close button

### Interactions & Animation
- Add hover states for interactive elements (subtle background change or scale)
- Use CSS transitions (150-300ms ease) for state changes
- Animate entrances with subtle fade-in or slide-up
- Use `transform` and `opacity` for performant animations

### Responsive Design
- Mobile-first approach: design for small screens, enhance for larger
- Use relative units (rem, %, vw/vh) over fixed px where appropriate
- Test breakpoints: 480px, 768px, 1024px, 1280px
- Touch-friendly: minimum 44x44px tap targets

## For Games & Interactive Projects

When building games or interactive experiences:
- Use `<canvas>` or DOM-based rendering as appropriate for the complexity
- Implement proper game loop with `requestAnimationFrame`
- Handle keyboard/mouse/touch input cleanly
- Add visual feedback for user actions (particles, screen shake, color flash)
- Include a start screen, HUD/score display, and game over state
- Use sprite-based or procedural graphics — avoid placeholder rectangles
- Add sound effects where appropriate using Web Audio API
- Target 60fps — optimize render loops

## For Single-File Projects

When creating everything in one HTML file:
- Inline CSS in `<style>` and JS in `<script>`
- Use modern ES6+ JavaScript (no build tools needed)
- Structure code with clear sections: styles, markup, logic
- Result should be immediately openable in a browser

## Output Guidelines

- Write complete, runnable code — no placeholders or TODOs
- Include all assets inline (SVG icons, CSS gradients for backgrounds)
- Add a favicon using an inline SVG data URI
- Make it immediately impressive when opened in a browser
