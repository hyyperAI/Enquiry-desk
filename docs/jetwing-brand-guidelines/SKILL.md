---
name: jetwing-brand-guidelines
description: Applies Jetwing Travels' brand colors, typography and voice to any artifact (UI, documents, emails, slides) that should carry the Jetwing look-and-feel. Use it when brand colors, style guidelines, visual formatting or tone of voice for Jetwing Travels apply.
---

# Jetwing Travels Brand Styling

## Overview

Brand identity for Jetwing Travels (jetwingtravels.com), a Sri Lankan destination
management company and tour operator.

**Source**: derived from the live website's theme CSS and homepage copy on
2026-11-17. This is not an official Jetwing brand book. If Jetwing supplies one,
it overrides this file.

**Keywords**: Jetwing, Jetwing Travels, branding, brand colors, typography, visual
identity, tone of voice, Sri Lanka travel

## Brand Guidelines

### Colors

**Main Colors:**

- Olive: `#ADAB3F` - Signature brand color. Links, rules, icons, large fills
- Olive Dark: `#8C8A01` - Hover states, borders, large headings on white
- Olive Deep: `#737101` - Olive text and olive buttons that carry white text
- Olive Light: `#D3D162` - Tints, highlights, decorative fills
- Black: `#000000` - Primary text
- White: `#FFFFFF` - Primary background

**Accent Colors:**

- Magenta: `#E30079` - Primary call-to-action (Enquire, Book, Send)
- Magenta Dark: `#C9036C` - CTA border and hover

**Neutrals:**

- Charcoal: `#2B2E35` - Dark sections, footers
- Gray: `#555555` - Secondary text
- Mid Gray: `#999999` - Placeholder and disabled text
- Light Gray: `#EEEEEE` - Dividers, subtle backgrounds

**Usage rules:**

- Olive is the brand. Magenta is reserved for the single most important action
  on a screen; do not use it for decoration.
- Roughly 70% white/neutral, 20% olive, under 10% magenta.
- Red (`#DD0B17`) appears in the site CSS for errors and alerts. Use it only for
  error states, never as a brand color.

**Contrast (WCAG AA):**

- White text on Olive `#ADAB3F` fails (about 2.4:1). The website does this; do
  not copy it. For white text on olive use Olive Deep `#737101` (about 5.2:1).
- White on Olive Dark `#8C8A01` is about 3.6:1: large text (18px bold / 24px+) only.
- White on Magenta `#E30079` passes (about 4.6:1).
- Olive `#ADAB3F` as text on white fails for body copy. Use Olive Deep for
  olive-colored text and links at body size.

### Typography

- **Headings**: Playfair Display (with Georgia, serif fallback)
- **Body Text**: Raleway (with Helvetica Neue, Arial, sans-serif fallback)
- Both are free on Google Fonts.

**Scale (web):**

- H1 / H2: 40px Playfair Display, regular weight
- H3: 24-28px Playfair Display
- Body: 18px Raleway on marketing pages; 14-16px in dense product UI
- Eyebrow / label above headings: Raleway, small, letter-spaced

**Rules:**

- Playfair Display is for headings and short display lines only. Never set
  paragraphs, form labels, table data or buttons in it.
- Buttons and UI controls: Raleway, medium or semibold.
- Raleway's default numerals are old-style. In tables, prices and dates enable
  lining numerals (`font-variant-numeric: lining-nums tabular-nums`).

### Shape and Components

- Corners are square to barely rounded: 0-1px on buttons and inputs, 4px maximum
  on cards. No pill buttons, no large radii.
- Flat surfaces. No drop shadows on buttons or inputs.
- Primary button: Magenta `#E30079` fill, white text, 1px `#C9036C` border.
- Secondary button: Olive Deep `#737101` fill with white text, or an olive
  outline on white.
- Inputs: white background, `#666666` text, square corners.
- Spacing base unit: 4px.

### Imagery

- Full-bleed, high-saturation photography of Sri Lanka: beaches, wildlife,
  heritage sites, tea country, food.
- Photos carry the color. Keep the UI around them white and restrained.
- Text over photos needs a dark overlay or a solid panel; never raw text on a
  busy image.

### Logo

- File: `https://jetwingtravels.com/wp-content/uploads/2023/03/main-logo.png`
- Favicon: `https://jetwingtravels.com/wp-content/themes/theme-jetwing-travels/favicon.ico`
- Use the supplied file unmodified: no recoloring, stretching, effects or
  re-typesetting. Keep clear space around it of at least the logo's height / 2.
- Place on white or very light backgrounds unless Jetwing provides a reversed
  version.

### Voice and Tone

- **Personality**: warm host, proud of the island, expert without being stiff.
- **Core idea**: "The Home of Legendary Sri Lankan Hospitality".
- **Proof points used on the site**: decades in business, own hotels across the
  island, own vehicle fleet, specialist teams, best guides, sustainability.
- Speak to the traveler directly ("your journey", "your way"). First person
  plural for the company ("we know our island home").
- Evocative but concrete: name the place and what the traveler will see or do.
- British English spelling (Sri Lankan convention): "colour", "traveller",
  "enquiry".
- In operational writing (enquiry replies, quotes, confirmations) drop the
  poetry: lead with the answer, dates, prices and next step, and keep one warm
  line at the open or close.
- Avoid: discount/hard-sell language, exclamation-mark stacks, generic
  travel clichés with no place attached.

**Tour themes (use these names exactly):** Barefoot Luxury, Following The Wild,
Romantic Serendipity, Join a Group, Sri Lanka with Jetwing, Authentic Ceylon,
Adventurous Spirit.

## Technical Details

### CSS variables

```css
:root {
  --jw-olive: #ADAB3F;
  --jw-olive-dark: #8C8A01;
  --jw-olive-deep: #737101;
  --jw-olive-light: #D3D162;
  --jw-magenta: #E30079;
  --jw-magenta-dark: #C9036C;
  --jw-ink: #000000;
  --jw-charcoal: #2B2E35;
  --jw-gray: #555555;
  --jw-mid-gray: #999999;
  --jw-line: #EEEEEE;
  --jw-white: #FFFFFF;
  --jw-font-head: 'Playfair Display', Georgia, serif;
  --jw-font-body: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
```

### Tailwind (`theme.extend`)

```js
colors: {
  jw: {
    olive: '#ADAB3F', 'olive-dark': '#8C8A01', 'olive-deep': '#737101', 'olive-light': '#D3D162',
    magenta: '#E30079', 'magenta-dark': '#C9036C',
    ink: '#000000', charcoal: '#2B2E35', gray: '#555555', 'mid-gray': '#999999', line: '#EEEEEE',
  },
},
fontFamily: {
  head: ['"Playfair Display"', 'Georgia', 'serif'],
  body: ['Raleway', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
},
borderRadius: { DEFAULT: '0', card: '4px' },
```

### Fonts

```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Raleway:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### RGB values (for python-pptx / docx)

- Olive: 173, 171, 63
- Olive Dark: 140, 138, 1
- Olive Deep: 115, 113, 1
- Olive Light: 211, 209, 98
- Magenta: 227, 0, 121
- Charcoal: 43, 46, 53
