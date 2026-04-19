---
name: designer
description: "**DESIGN SYSTEM SKILL** — Comprehensive workflow for UI/UX design tasks on HocTapThuDuc. USE WHEN: auditing design consistency, creating/refactoring components, improving accessibility, testing responsive design, managing design tokens, optimizing CSS. Guides: component creation following Gen Z Academic Edition patterns; design audits for inconsistencies; responsive testing across breakpoints (1200/992/768/480px); accessibility reviews; design token consolidation. Includes: color system, typography, spacing scale, animation patterns, accessibility checklist, performance optimization. PRODUCES: consistent, accessible, performant design components and recommendations."
---

# HocTapThuDuc Designer Skill

## Overview

This skill guides comprehensive UI/UX design work for the HocTapThuDuc educational platform. It ensures design consistency, accessibility, and performance across the Gen Z Academic Edition design system.

## Quick Start

**When to use this skill:**
- Creating or refactoring UI components
- Auditing design system consistency
- Fixing responsive design issues
- Implementing accessibility improvements
- Consolidating or managing design tokens
- Optimizing CSS performance

**Type:** Multi-step workflow with decision branches and quality checkpoints

---

## Core Design System Reference

### Color Palette

| Purpose | Color | Hex | Usage |
|---------|-------|-----|-------|
| **Primary Action** | Royal Blue | #2563eb | Buttons, links, primary actions |
| **Secondary/Energy** | Amber | #f59e0b | Emphasis, highlights, CTAs |
| **Status: Success** | Green | #10b981 | Checkmarks, success states |
| **Status: Danger** | Red | #ef4444 | Errors, destructive actions |
| **Status: Warning** | Orange | #f97316 | Alerts, cautions |
| **Status: Info** | Blue | #3b82f6 | Information badges |
| **Neutral: Text** | Dark Gray | #1f2937 | Body text |
| **Neutral: Borders** | Light Gray | #e5e7eb | Borders, dividers |
| **Neutral: Backgrounds** | White/Light | #f9fafb | Backgrounds |
| **Garden Theme** | Earthy | Various | Paper, wood, moss, gold |

**Use CSS variables:** Colors should be defined in `config/` or a centralized `public/css/design-tokens.css`. Avoid hard-coding hex values in component files.

### Typography

| Category | Font | Size | Usage |
|----------|------|------|-------|
| **Display/Headings** | Quicksand | 2rem (h1), 1.5rem (h2), 1.25rem (h3) | Page titles, section headers |
| **Body** | Be Vietnam Pro | 1rem | Default text |
| **Small** | Be Vietnam Pro | 0.875rem | Captions, metadata |
| **Monospace** | System | 0.875rem | Code, technical content |

**Principles:**
- Use semantic line-height (1.6 for readability)
- Avoid hard-coded pixel sizes; use `rem` units
- Scale based on viewport (responsive typography)

### Spacing & Sizing

**Base Unit:** 8px

| Scale | Value | Usage |
|-------|-------|-------|
| **xs** | 4px | Tight spacing (rarely used) |
| **sm** | 8px | Default margins/padding |
| **md** | 16px | Medium sections |
| **lg** | 24px | Large sections |
| **xl** | 32px | Page sections |

**Border Radius:**
- Small: 8px (inputs, badges)
- Medium: 12px (cards, containers)
- Large: 20px (featured cards)
- Extra Large: 30px (pills, large buttons)

### Responsive Breakpoints

| Breakpoint | Size | Device | Behavior |
|------------|------|--------|----------|
| **Desktop** | ≥1200px | Large screens | Full layout |
| **Tablet** | 992–1199px | Medium screens | Adjusted grid |
| **Small Tablet** | 768–991px | Small tablets | Single/double column |
| **Mobile** | <768px | Phones | Single column, optimized touch |
| **Tiny Mobile** | <480px | Very small phones | Minimal layout |

### Animation & Interaction

**Easing Functions:**
- Smooth transitions: `cubic-bezier(0.4, 0, 0.2, 1)`
- Playful bounce: `cubic-bezier(0.68, -0.55, 0.265, 1.55)`
- Standard duration: `0.2s` to `0.3s`

**Effects:**
- Bounce animations on clicks
- Floating/drifting backgrounds
- Smooth color transitions on hover
- `prefers-reduced-motion` media query support (disable animations for accessibility)

### Accessibility Standards

| Requirement | Criteria | Check |
|------------|---------|-------|
| **Button Size** | ≥44px touch target | Mobile-friendly interaction |
| **Color Contrast** | WCAG AA (4.5:1 for text) | Use contrast checker |
| **Focus Indicators** | Visible outline or highlight | Keyboard navigation visible |
| **Keyboard Navigation** | All interactive elements focusable | Tab order logical |
| **ARIA Labels** | Present where needed | Screen reader support |
| **Alt Text** | Descriptive for images | Icon alternatives for decorative |
| **Reduced Motion** | Animations disable | Check `prefers-reduced-motion` |
| **Form Labels** | Associated with inputs | Properly `for` attributes |

---

## Workflow: Component Creation

### Step 1: Analyze Existing Patterns
- [ ] Search for similar components in [public/css/](public/css/) and [views/](views/)
- [ ] Check [config/gardenAssets.js](config/gardenAssets.js) for asset patterns
- [ ] Review established component structure (e.g., button variants, color variants)
- [ ] Note naming convention (BEM? utility-based? custom?)

### Step 2: Design the Component Structure
- [ ] Define component purpose and use cases
- [ ] List **variants** (primary/secondary, sizes, states)
- [ ] Identify **states** (default, hover, active, disabled, focus)
- [ ] Plan **responsive behavior** across breakpoints
- [ ] Sketch accessibility requirements (focus, ARIA, keyboard support)

### Step 3: Create HTML/Views Template
- [ ] Use semantic HTML (`<button>`, `<nav>`, `<form>`, etc.)
- [ ] Add ARIA labels where needed
- [ ] Ensure logical focus order for keyboard navigation
- [ ] Plan alt text for any decorative elements
- [ ] Test with screen reader mentally

### Step 4: Write CSS
- [ ] Use CSS variables for colors, spacing, typography
- [ ] Follow 8px base unit spacing
- [ ] Implement all variants (size, state, theme)
- [ ] Add responsive styles for each breakpoint
- [ ] Include `:focus`, `:hover`, `:active` states
- [ ] Add `prefers-reduced-motion` query for animations
- [ ] Document non-obvious patterns in CSS comments

### Step 5: Test Component
- [ ] **Visual:** Check all variants and states
- [ ] **Responsive:** Test at 1200px, 992px, 768px, 480px breakpoints
- [ ] **Keyboard:** Tab through and verify focus indicators
- [ ] **Accessibility:** Check color contrast (WCAG AA), test with screen reader
- [ ] **Animation:** Verify smooth transitions, check reduced-motion
- [ ] **Performance:** No layout shifts, animations smooth

### Step 6: Document
- [ ] Add code comments for complex logic
- [ ] Include usage examples in comments
- [ ] Reference design system (colors, sizes, patterns)
- [ ] Document responsive behavior changes

---

## Workflow: Design Audit

### Step 1: Scope the Audit
- [ ] Decide focus area: **Consistency** | **Accessibility** | **Performance** | **Responsive** | **All**
- [ ] List files/sections to audit (e.g., all CSS files, or specific feature)
- [ ] Document current state (screenshot, measurements, known issues)

### Step 2: Consistency Audit
- [ ] Compare color usage across components
  - [ ] Each color used consistently (not multiple shades of same color)?
  - [ ] Color system aligned with design tokens?
- [ ] Check spacing consistency
  - [ ] Margins/padding follow 8px base unit?
  - [ ] Consistent spacing between sections?
- [ ] Check typography
  - [ ] Heading levels used semantically?
  - [ ] Font sizes consistent across similar components?
  - [ ] Line-height appropriate for readability?
- [ ] Identify duplicated CSS or components

### Step 3: Responsive Design Audit
- [ ] View at each breakpoint: 1200px, 992px, 768px, 480px
- [ ] Check for overflow or layout shifts
- [ ] Verify touch buttons are ≥44px
- [ ] Confirm readability at all sizes
- [ ] Check media queries are correct

### Step 4: Accessibility Audit
- [ ] Color contrast: Use tool to verify WCAG AA (4.5:1 text, 3:1 UI)
- [ ] Focus indicators: All interactive elements have visible focus
- [ ] Keyboard navigation: Tab order is logical, no traps
- [ ] ARIA labels: Present where needed (nav, buttons, icons)
- [ ] Form labels: All inputs have associated labels
- [ ] Reduced motion: Animations disable appropriately

### Step 5: Performance Audit
- [ ] Check CSS file size and count (43+ files identified)
- [ ] Look for unused CSS or duplicates
- [ ] Verify animations don't cause layout thrashing
- [ ] Check for hard-coded values (should be variables)
- [ ] Review complexity of selectors

### Step 6: Document Findings
- [ ] Create audit report with:
  - Issues found (with location)
  - Severity (critical, high, medium, low)
  - Recommended fix
  - Impact on users
- [ ] Categorize by improvement priority
- [ ] Suggest quick wins vs. long-term refactoring

### Step 7: Plan Improvements
- [ ] Prioritize by impact and effort
- [ ] Create focused tasks for fixes
- [ ] Estimate scope of refactoring work

---

## Workflow: Design Token Management

### Step 1: Audit Current State
- [ ] Identify all CSS variable definitions (likely in multiple files)
- [ ] List hard-coded colors, sizes, spacing values
- [ ] Check for duplication (same value defined multiple times)
- [ ] Document current naming convention

### Step 2: Create Design Tokens File
- [ ] Create centralized `public/css/design-tokens.css`
- [ ] Define **Color tokens:**
  ```css
  :root {
    --color-primary: #2563eb;
    --color-secondary: #f59e0b;
    --color-success: #10b981;
    --color-danger: #ef4444;
    --color-warning: #f97316;
    --color-info: #3b82f6;
    /* ... more colors */
  }
  ```
- [ ] Define **Space tokens:**
  ```css
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  ```
- [ ] Define **Typography tokens:**
  ```css
  --font-primary: "Quicksand", sans-serif;
  --font-secondary: "Be Vietnam Pro", sans-serif;
  --font-mono: "Courier New", monospace;
  ```
- [ ] Define **Sizing tokens** (border-radius, shadows, transitions, etc.)

### Step 3: Migrate Components
- [ ] Update components to use token variables
- [ ] Remove hard-coded values
- [ ] Test after migration (visual regression)
- [ ] Document any component-specific overrides

### Step 4: Add Theming Support (Optional)
- [ ] Define dark mode color tokens:
  ```css
  @media (prefers-color-scheme: dark) {
    --color-primary: #60a5fa;
    /* ... dark mode colors */
  }
  ```
- [ ] Test dark mode across all components

### Step 5: Document Token System
- [ ] Create design token reference document
- [ ] Include usage examples
- [ ] Document when to add new tokens vs. creating custom values
- [ ] Link from project README

---

## Decision Tree: When to Refactor vs. Add

| Situation | Decision | Action |
|-----------|----------|--------|
| **New component, no similar existing** | Create new | Follow Component Creation workflow |
| **Similar component exists but styles differ** | Audit + standardize | Find shared base, create variants |
| **Component duplicated 3+ times** | Refactor | Extract to shared partial/CSS class |
| **CSS file has multiple unrelated components** | Reorganize | Split into modular files |
| **Color used in 5+ different places** | Add token | Create design token, migrate usages |
| **All projects need similar component** | Document in wiki | Update project documentation |

---

## Quality Checklist: Before Committing

- [ ] **Visual Quality**
  - [ ] Component looks pixel-perfect at all breakpoints
  - [ ] All variants tested (size, state, color, theme)
  - [ ] Hover/focus/active states visible and intuitive
  
- [ ] **Accessibility**
  - [ ] Color contrast meets WCAG AA (4.5:1)
  - [ ] Focus indicators clearly visible
  - [ ] Keyboard navigation works
  - [ ] ARIA labels present where needed
  - [ ] No reduced-motion violations
  
- [ ] **Responsive**
  - [ ] Tested at 1200px, 992px, 768px, 480px
  - [ ] Touch targets ≥44px on mobile
  - [ ] No horizontal overflow
  - [ ] Text remains readable
  
- [ ] **Performance**
  - [ ] No unused CSS
  - [ ] Animations smooth (60fps)
  - [ ] No layout shifts
  - [ ] CSS follows DRY principle
  
- [ ] **Code Quality**
  - [ ] CSS variables used (no hard-coded colors/sizes)
  - [ ] Follows project naming conventions
  - [ ] Comments explain non-obvious logic
  - [ ] No duplicate selectors across files
  
- [ ] **Documentation**
  - [ ] Component purpose clear from comments
  - [ ] Responsive behavior documented
  - [ ] Variants explained
  - [ ] Dependencies noted

---

## Common Patterns

### Button Pattern
```css
.btn {
  padding: var(--space-sm) var(--space-md);
  border-radius: 8px;
  font-family: var(--font-secondary);
  transition: all 0.2s ease;
  cursor: pointer;
}

.btn:hover { transform: translateY(-2px); }
.btn:active { box-shadow: none; }
.btn:focus { outline: 2px solid var(--color-primary); }

@media (prefers-reduced-motion: reduce) {
  .btn { transition: none; }
}
```

### Responsive Grid Pattern
```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-lg);
}

@media (max-width: 768px) {
  .grid { grid-template-columns: 1fr; }
}
```

### Focus Indicator Pattern
```css
.interactive:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

---

## Resources

- **Color Contrast Checker:** https://webaim.org/resources/contrastchecker/
- **WCAG Accessibility:** https://www.w3.org/WAI/WCAG21/quickref/
- **Design System Best Practices:** https://www.nngroup.com/articles/design-systems-101/
- **CSS Variables Guide:** https://developer.mozilla.org/en-US/docs/Web/CSS/--*
- **Responsive Design:** https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design

---

## Related Documentation

See also:
- `LESSONDETAIL_V2_README.md` for feature-specific design notes
- `public/css/` for current component styles
- `config/gardenAssets.js` for asset patterns
