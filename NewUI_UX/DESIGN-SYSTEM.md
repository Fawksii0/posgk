# POSGK Design System 🎨

## Color Palette

### Brand Colors
- **Emblem Gold:** `#F6B83F` (Primary actions and highlights)
- **Deep Gold:** `#A56A00` (Hover and emphasis states)
- **Soft Gold:** `#FFF3D8` (Selected and subtle backgrounds)
- **Black:** `#111111` (Brand surfaces and primary text)
- **White:** `#FFFFFF` (Cards, contrast, and emblem lettering)

### Accent Colors
- **Success Green:** `#10B981` (Orders complete, available tables)
- **Warning Orange:** `#F59E0B` (Pending items, needs attention)
- **Error Red:** `#EF4444` (Issues, cancellations)
- **Info Teal:** `#06B6D4` (Information, notifications)

### Neutral Colors
- **White:** `#FFFFFF`
- **Light Gray:** `#F3F4F6`
- **Medium Gray:** `#9CA3AF`
- **Dark Gray:** `#374151`
- **Near Black:** `#111827`

### Dark Mode (Optional)
- **Background:** `#111111`
- **Surface:** `#1E1D1A`
- **Border:** `#37342E`

---

## Typography

### Font Family
**Primary:** `Inter` or `Poppins` (sans-serif)
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Font Sizes & Weights
- **Display 1:** 40px / Bold (800) - Page titles
- **Display 2:** 32px / Bold (700) - Section headers
- **Heading 1:** 28px / Semibold (600) - Major sections
- **Heading 2:** 24px / Semibold (600) - Subsections
- **Heading 3:** 20px / Semibold (600) - Card titles
- **Body Large:** 16px / Regular (400) - Primary text
- **Body Normal:** 14px / Regular (400) - Secondary text
- **Body Small:** 12px / Regular (400) - Labels, captions
- **Button:** 14px / Semibold (600) - Buttons
- **Caption:** 11px / Regular (400) - Very small text

---

## Spacing System

**Base unit:** 8px

| Size | Value | Usage |
|------|-------|-------|
| xs | 4px | Micro spacing |
| sm | 8px | Compact spacing |
| md | 16px | Standard spacing |
| lg | 24px | Comfortable spacing |
| xl | 32px | Large sections |
| 2xl | 40px | Section breaks |
| 3xl | 48px | Major breaks |

---

## Component Styles

### Buttons

**Primary Button**
```
Background: #F6B83F
Color: #111111
Padding: 10px 16px
Border-radius: 6px
Font-weight: 600
Font-size: 14px
Hover: #A56A00
Active: #8C5A00
```

**Secondary Button**
```
Background: #F3F4F6
Border: 1px #D1D5DB
Padding: 10px 16px
Border-radius: 6px
Hover: #E5E7EB
```

**Danger Button**
```
Background: #EF4444
Color: White
Padding: 10px 16px
Border-radius: 6px
```

### Cards

```
Background: #FFFFFF
Border: 1px solid #E5E7EB
Border-radius: 8px
Padding: 16px
Shadow: 0 1px 3px rgba(0,0,0,0.1)
Hover: Shadow 0 4px 6px rgba(0,0,0,0.1)
```

### Inputs

```
Background: #FFFFFF
Border: 1px solid #D1D5DB
Padding: 8px 12px
Border-radius: 6px
Font-size: 14px
Focus: Border color #A56A00, Shadow 0 0 0 3px rgba(246,184,63,0.2)
```

### Badge/Tag

```
Background: #FFF3D8
Color: #704900
Padding: 4px 8px
Border-radius: 4px
Font-size: 12px
Font-weight: 600
```

---

## Spacing Examples

### Card Layout
```
Outer padding: 24px (lg)
Inner content gap: 16px (md)
Item spacing: 8px (sm)
```

### Grid System
- **Desktop:** 12 columns, gap 16px
- **Tablet:** 6 columns, gap 12px
- **Mobile:** 1 column, gap 8px

---

## Animations & Transitions

### Timing
- **Fast:** 150ms (hover effects)
- **Standard:** 200ms (transitions)
- **Slow:** 300ms (modals)

### Easing
```css
transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
```

### Common Animations
- **Button Hover:** Scale 1.02 + shadow increase
- **Card Hover:** Shadow increase + slight lift
- **Fade In:** 200ms ease-in-out
- **Slide:** 200ms ease-out

---

## Status Indicators

| Status | Color | Icon | Background |
|--------|-------|------|------------|
| Available | Green | ✓ | #D1FAE5 |
| Pending | Orange | ⏱ | #FEF3C7 |
| Complete | Green | ✅ | #D1FAE5 |
| Error | Red | ✕ | #FEE2E2 |
| Info | Teal | ℹ | #CCFBF1 |

---

## Dark Mode Support

When implementing dark mode, reverse:
- Background: #FFFFFF → #111111
- Text: #111827 → #FFFFFF
- Borders: #E5E7EB → #37342E
- Cards: Add slight border instead of shadow

---

## Accessibility

- **Contrast Ratio:** Minimum 4.5:1 for text
- **Focus States:** Visible 3px outline or border
- **Icon Size:** Minimum 24x24px for clickable
- **Touch Target:** Minimum 44x44px for mobile

---

## Icons

Use **Lucide React** for consistency:
```bash
npm install lucide-react
```

### Common Icons for POS
- Tables: `Grid3X3`
- Menu: `Menu`, `Plus`, `Trash2`
- Orders: `CheckCircle`, `Clock`, `AlertCircle`
- Settings: `Settings`, `Users`, `BarChart3`
- Actions: `Edit`, `Save`, `X`, `ChevronDown`

---

## Implementation Notes

✅ Use CSS Variables for theme switching
✅ Keep spacing consistent with 8px grid
✅ Test on mobile (responsive design)
✅ Ensure sufficient color contrast
✅ Use semantic HTML + aria labels

---

**Last Updated:** October 17, 2026
