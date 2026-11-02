# DESIGN.md — "Soft Sage Clinical" Design System

> **Purpose:** This file tells an AI agent how the product should *look and feel*.
> It describes a visual language only. **Do not recreate the reference dashboard.**
> Do not copy its screen layout, its section names, its sample data (names, numbers, "Today's Nursing", "Ai Assistant", etc.) or its widgets one-for-one.
> Apply this style to whatever screens the product actually needs (for example: OPD registration, doctor queue, prescription, pharmacy inventory, IP admission, admin analytics).

All hex values below were estimated from a reference image. Treat them as the source of truth for this project, and keep them in one place (CSS variables / theme file), never scattered as literals in components.

---

## 1. Design Character

A calm, premium, healthcare look. Soft off-white surfaces, one deep forest green for emphasis, sage and olive greens for support, and a small set of warm pastel chart colours. Large rounded shapes, generous breathing room, and quiet typography.

Five rules that define the look:

1. **Soft surfaces, not boxes.** Cards are slightly lighter than the page and separated by space and a very soft shadow, not hard borders.
2. **Big radius everywhere.** Large cards 24px, inner tiles 16px, controls fully pill-shaped.
3. **One dark anchor colour.** Deep forest green is used for the primary button, the selected state and a few key chips. It is the strongest contrast on any screen.
4. **Green family + pastel data colours.** UI chrome stays in green and neutral; only charts and status use extra hues (gold, lilac, sky blue, red).
5. **Quiet type, loud numbers.** Labels are small and muted. The one key number on a card is large and light-weight.

Avoid: harsh borders, pure black text, saturated primary colours, drop shadows with strong offset, sharp corners, dense tables with gridlines, neon accents.

---

## 2. Design Tokens

### 2.1 Colour

#### Neutrals (surfaces and text)

| Token | Hex | Use |
|---|---|---|
| `--bg-canvas` | `#EDEDEA` | App background behind cards |
| `--bg-card` | `#F8F8F6` | Main cards and panels |
| `--bg-tile` | `#EFEFEC` | Tiles nested inside a card (stat tiles, list rows) |
| `--bg-raised` | `#FFFFFF` | Floating controls: nav pill bar, icon buttons, inputs, dropdowns |
| `--line-soft` | `#E4E4DF` | Rare hairlines, row dividers |
| `--text-strong` | `#10200F` | Headings, key numbers (a green-tinted near-black, never `#000`) |
| `--text-body` | `#3C463A` | Regular text |
| `--text-muted` | `#6F776B` | Secondary labels, helper text |
| `--text-faint` | `#9BA296` | Placeholders, axis labels, disabled |

#### Greens (brand)

| Token | Hex | Use |
|---|---|---|
| `--green-900` | `#12301A` | Primary buttons, selected chips, logo chip, map/send buttons, tooltips |
| `--green-700` | `#5F7F45` | Progress fills, strong chart segments |
| `--green-600` | `#7A9A5F` | Active tab pill, brand mark background, icon rings |
| `--green-300` | `#B7C79A` | Light fills, chart low-intensity series |
| `--sage-200` | `#CDD6B5` | Feature card background (chart/analytics card) |
| `--sage-100` | `#E3E9D3` | Subtle tint behind highlights |

#### Chart and accent colours (use only in data visuals and small highlights)

| Token | Hex | Use |
|---|---|---|
| `--gold-500` | `#D9B93E` | Primary data series, "current" segment |
| `--lilac-300` | `#D9AEE0` | Secondary data series, "target" segment |
| `--leaf-400` | `#A9C46A` | Third series, positive trend |

#### Status colours

Always pair a dot with a text label inside a pill. The pill background is a very light tint of the dot colour.

| State | Dot | Pill background | Example meaning |
|---|---|---|---|
| Info / active | `#4DB6E8` | `#E3F1FA` | On duty, in progress |
| Success / free | `#6BBF59` | `#E5F2DF` | Available, completed |
| Danger / away | `#E5483D` | `#FBE9E7` | On leave, critical, overdue |
| Warning (add for completeness) | `#E8A93A` | `#FBF1DC` | Low stock, near expiry |

#### Feature gradient card (for a single hero or assistant panel)

A blurred organic mesh in greens, like out-of-focus foliage: base `#5E7F3F`, highlights `#9DB57A` and `#B9CC96`, soft dark pockets `#3F5E2A`. Text on it is white. Use **at most one per screen**.

### 2.2 Typography

**Family:** one clean, slightly geometric sans-serif with friendly round shapes and open apertures. Closest free choices, in order: `Onest`, `Figtree`, `Plus Jakarta Sans`, `Manrope`. Fallback stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Use one family only, varied by size and weight.

**Weights:** 300 (big numbers), 400 (body), 500 (headings, buttons). Avoid 600 and above except in tiny status labels if needed.

**Letter spacing:** headings `-0.02em`; body `0`. **Never use all-caps labels.** Use sentence case everywhere.

| Role | Size / line-height | Weight | Colour |
|---|---|---|---|
| Page title | 40px / 44px | 500 | `--text-strong` |
| Page subtitle | 14px / 20px | 400 | `--text-muted` |
| Card title | 20px / 26px | 500 | `--text-strong` |
| Feature number (hero stat) | 56px / 56px | 300 | `--text-strong` |
| Secondary number | 32px / 36px | 300–400 | `--text-strong` |
| Tile value | 14px / 20px | 400 | `--text-muted` |
| List primary text | 14px / 20px | 500 | `--text-strong` |
| List secondary text | 12px / 16px | 400 | `--text-muted` |
| Time stamps in lists | 20px / 24px | 400 | `--text-strong` |
| Pill / status label | 12px / 16px | 500 | status text colour |
| Axis / legend | 12px / 16px | 400 | `--text-muted` |

Minimum text size is **12px**. The reference image uses tiny 9–10px text; do not copy that. Keep body contrast at 4.5:1 or better (`--text-muted` on `--bg-card` passes; `--text-faint` is for placeholders and disabled only).

### 2.3 Spacing

4px base unit. Common steps: 4, 8, 12, 16, 20, 24, 32, 40.

- Page horizontal padding: 32px desktop, 16px mobile.
- Gap between cards: 16px.
- Card inner padding: 20–24px.
- Gap between tiles inside a card: 12px.
- List row height: 56–64px with 12px vertical padding.

### 2.4 Radius

| Token | Value | Use |
|---|---|---|
| `--r-card` | 24px | Main cards, feature card |
| `--r-tile` | 16px | Nested tiles, list rows, input container |
| `--r-control` | 12px | Square icon buttons, small buttons |
| `--r-pill` | 999px | Nav tabs, status pills, dropdown triggers, chips, progress bars |

### 2.5 Elevation

Almost flat. Separation comes from colour contrast between `--bg-canvas`, `--bg-card` and `--bg-tile`.

- Cards: no shadow, or `0 1px 2px rgba(16,32,15,0.04)`.
- Floating controls (nav pill bar, dropdown menus, tooltips): `0 4px 16px rgba(16,32,15,0.08)`.
- Never use heavy or dark shadows.

---

## 3. Layout Principles

- **Modular card grid, 12 columns**, with cards of different widths and heights fitted together like a bento layout. Adjacent cards align on top and bottom edges.
- Cards group related information under one title; do not repeat the same card shape for unrelated content.
- Mix card sizes: one wide analytic card, a few narrow list cards, a few compact stat cards.
- Page header sits above the grid: large title on the left, small context info (organisation, date) right-aligned.
- Top bar is a single row: brand mark and user chip on the left, a centred pill navigation, and round or square icon buttons on the right.
- Left-align text. Numbers sit directly beneath their labels or beside them, never centred in tables.
- **Responsive:** 3-column grid ≥1200px, 2 columns ≥768px, 1 column below. The pill navigation becomes a scrollable row or a menu on mobile. Tap targets are at least 44px high.

---

## 4. Components

For each component, follow the shape, colour and spacing described. Content is only an example of what *kind* of thing goes there.

### 4.1 Top bar

- Brand mark: 40px rounded square (`--r-control`), `--green-600` background, white icon.
- User chip beside it: pill/rounded rectangle, `--green-900` background, white 14px text, small grid icon on the left.
- Centre navigation: a white (`--bg-raised`) pill container with 4px padding, floating shadow. Each tab is a pill with 8px 16px padding, 14px text. **Active tab:** `--green-600` background, white text. **Inactive:** transparent, `--text-body`.
- Right side: 40px square or round white icon buttons (notification, menu) with `--r-control`.

### 4.2 Page header

- Title 40px/500, tight tracking, `--text-strong`.
- One-line subtitle 14px `--text-muted`.
- Right-aligned meta block: small icon + organisation name (14px, `--text-strong`), date beneath (12px, `--text-muted`).

### 4.3 Card

- Background `--bg-card`, radius 24px, padding 20–24px.
- Header row: title left (20px/500), optional action on right (dropdown pill, search icon button, or text button with plus icon).
- Optional count badge beside the title: small circle with the number, `--bg-tile` background.

### 4.4 Stat tile (nested in a card)

- Background `--bg-tile`, radius 16px, padding 16px, centred content.
- A 40px circular icon ring on top: 1.5px `--green-600` stroke, white inside, line icon in `--green-700`.
- Label (14px, `--text-strong`), then value (14px, `--text-muted`). Tiles sit in an equal-width row with 12px gaps.

### 4.5 Segmented progress bar

- Height 8–10px, fully rounded.
- Filled part in two greens: lighter `--green-300`/`--green-600` first segment, darker `--green-700` second segment.
- The unfilled remainder is a **diagonal hatch** pattern (thin diagonal stripes in `--line-soft` on `--bg-card`).
- Markers: thin vertical line with a round dot at a milestone, a small icon above it, and a percentage label beneath the bar (12px `--text-muted`).

### 4.6 List row with avatar and status pill

- Row: `--bg-tile` or `--bg-raised` background, radius 16px, padding 12px, 8px gap between rows.
- Left: 36–40px circular avatar (photo or initials). Initials fallback: `--sage-100` background, `--green-900` text.
- Middle: primary line 14px/500, secondary line 12px `--text-muted`.
- Right: status pill (see 4.7) or a small chevron button.

### 4.7 Status pill

- Height 24px, padding 0 10px, radius 999px.
- 6px dot + 12px/500 label, text colour a darker shade of the status colour, background from the status table in §2.1.
- Always include the text label; never colour alone.

### 4.8 Time-line list (schedule)

- Time in 20px `--text-strong` on the left (fixed 64px width), avatar and two-line text in the middle, small chevron circle button on the right.
- Rows separated by 1px `--line-soft` dividers, no row backgrounds.

### 4.9 Dropdown pill

- White background, 1px `--line-soft` border, radius 999px, padding 6px 12px, 12–14px text, small chevron. Optional leading icon.

### 4.10 Icon button

- 36–40px, white background, radius 12px (or full circle), 18px line icon, 1.5px stroke, `--text-strong`.

### 4.11 Hero number block

- Very large number (56px/300) with a small label and a tiny legend on the right (dots for each series, 12px).
- Pair it with a minimal area or line sparkline using `--green-300` and `--lilac-300`, with a single dark tooltip chip (`--green-900`, white text, 12px, radius 999px) marking the active point.

### 4.12 Feature chart card

- Background `--sage-200`, radius 24px, padding 20px, a small title top-left and a 3-dot menu top-right.
- Donut / radial chart with thick rounded segments in `--gold-500`, `--lilac-300`, `--leaf-400` and `--green-700`. Large centred number (32px/300) with a small caption beneath.
- A tooltip chip (`--green-900`) points at a segment.
- Legend at the bottom: small square dots + 12px labels.

### 4.13 Assistant / feature gradient panel

- Uses the blurred green mesh from §2.1, radius 24px, white text, one per screen.
- Suggestion chips: small translucent white pills (white at 20% opacity, 11–12px white text).
- Input block at the bottom: a translucent frame (white at 15%) containing a white input surface (radius 16px). Left: attach and mic icons in `--text-faint`. Right: 36px `--green-900` rounded-square send button with a white icon.
- Small meta row above the input (credits, upgrade) in 11–12px white at 80%.

### 4.14 Buttons

| Type | Style |
|---|---|
| Primary | `--green-900` background, white text, 14px/500, radius 12px (or pill), height 40–44px |
| Secondary | White background, 1px `--line-soft`, `--text-strong` text |
| Tertiary / text | No background, `--text-strong`, optional plus icon |
| Active tab | `--green-600` background, white text |

Hover: darken 6%. Pressed: darken 10%. Focus: 2px outline `--green-600` with 2px offset (always visible for keyboard users). Disabled: `--bg-tile` background, `--text-faint` text.

### 4.15 Form fields (not shown in the reference, extend consistently)

- Input height 44px, white background, radius 12px, 1px `--line-soft` border, 14px text, placeholder `--text-faint`.
- Focus: border `--green-600` + 3px ring `rgba(122,154,95,0.25)`.
- Labels 12–14px `--text-muted` above the input, sentence case.
- Checkboxes and toggles: checked state `--green-900`; radius 6px for checkboxes.
- Error: border and helper text in danger red, plus a clear message saying how to fix it.

### 4.16 Tables (not shown, extend consistently)

Avoid heavy grid tables. Use the **list-row pattern** (§4.6) for lists under ~12 columns of data. If a true table is required: no outer border, header text 12px `--text-muted`, rows 56px with `--line-soft` dividers, hover row `--bg-tile`, sticky header, numeric columns right-aligned.

---

## 5. Iconography and Imagery

- Line icons, 1.5px stroke, rounded caps and joins, 18–20px (24px inside stat rings). Suggested sets: Lucide, Phosphor (regular), Solar.
- Icons sit inside circular or rounded-square containers when they are the main visual of a tile.
- People appear as small circular photos (36–40px). If no photo exists, use initials.
- No emoji in the interface. No stock illustrations.

---

## 6. Data Visualisation

- Prefer **thick rounded strokes** (donut segments with rounded ends, rounded bar tops).
- Use colour in this order: `--gold-500`, `--lilac-300`, `--leaf-400`, `--green-700`.
- Light gridlines or none. Axis text 12px `--text-muted`.
- Mark the "current" value with one dark tooltip chip rather than labelling every point.
- Include a legend with colour dots *and* text. Never rely on colour alone for meaning.

---

## 7. Motion

- Motion is for feedback only: hover, press, expand, toggle, loading.
- Duration 150–220ms, easing `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Progress bars and donut segments may animate once on first load (600–800ms ease-out). Nothing else animates on its own.
- Respect `prefers-reduced-motion`: disable all non-essential animation.

---

## 8. Accessibility Floor

- Text contrast ≥ 4.5:1 (≥ 3:1 for large text and icons).
- Minimum text size 12px; minimum tap target 44×44px on touch.
- Visible keyboard focus on every interactive element.
- Status is always text + colour. Charts have a text summary or data table alternative.
- Don't use `--text-faint` for meaningful text.

---

## 9. Voice and Copy

- Sentence case, plain words, active verbs ("Add patient", "Save changes", not "Submit").
- Keep one name for each action across the whole flow.
- Short helper text, no marketing language inside the app.
- Errors say what happened and how to fix it, without apologising.

---

## 10. Implementation Snippets

### CSS variables

```css
:root {
  /* surfaces */
  --bg-canvas: #EDEDEA;
  --bg-card:   #F8F8F6;
  --bg-tile:   #EFEFEC;
  --bg-raised: #FFFFFF;
  --line-soft: #E4E4DF;

  /* text */
  --text-strong: #10200F;
  --text-body:   #3C463A;
  --text-muted:  #6F776B;
  --text-faint:  #9BA296;

  /* brand greens */
  --green-900: #12301A;
  --green-700: #5F7F45;
  --green-600: #7A9A5F;
  --green-300: #B7C79A;
  --sage-200:  #CDD6B5;
  --sage-100:  #E3E9D3;

  /* data */
  --gold-500:  #D9B93E;
  --lilac-300: #D9AEE0;
  --leaf-400:  #A9C46A;

  /* status */
  --info:    #4DB6E8; --info-bg:    #E3F1FA;
  --success: #6BBF59; --success-bg: #E5F2DF;
  --danger:  #E5483D; --danger-bg:  #FBE9E7;
  --warning: #E8A93A; --warning-bg: #FBF1DC;

  /* shape */
  --r-card: 24px;
  --r-tile: 16px;
  --r-control: 12px;
  --r-pill: 999px;

  /* shadow */
  --shadow-float: 0 4px 16px rgba(16, 32, 15, 0.08);

  /* type */
  --font-sans: "Onest", "Figtree", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

body {
  background: var(--bg-canvas);
  color: var(--text-body);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 20px;
}

.card { background: var(--bg-card); border-radius: var(--r-card); padding: 24px; }
.tile { background: var(--bg-tile); border-radius: var(--r-tile); padding: 16px; }

.pill-tab { padding: 8px 16px; border-radius: var(--r-pill); color: var(--text-body); }
.pill-tab[aria-current="page"] { background: var(--green-600); color: #fff; }

.btn-primary {
  background: var(--green-900); color: #fff;
  height: 44px; padding: 0 20px; border-radius: var(--r-control);
  font-weight: 500;
}
.btn-primary:focus-visible { outline: 2px solid var(--green-600); outline-offset: 2px; }

.progress-remainder {
  background: repeating-linear-gradient(
    135deg, var(--line-soft) 0 2px, transparent 2px 6px
  );
}
```

### Tailwind theme extension

```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        canvas: '#EDEDEA', card: '#F8F8F6', tile: '#EFEFEC',
        ink: { DEFAULT: '#10200F', body: '#3C463A', muted: '#6F776B', faint: '#9BA296' },
        forest: '#12301A',
        olive: { 700: '#5F7F45', 600: '#7A9A5F', 300: '#B7C79A' },
        sage: { 100: '#E3E9D3', 200: '#CDD6B5' },
        gold: '#D9B93E', lilac: '#D9AEE0', leaf: '#A9C46A',
      },
      borderRadius: { card: '24px', tile: '16px', control: '12px' },
      boxShadow: { float: '0 4px 16px rgba(16,32,15,0.08)' },
      fontFamily: { sans: ['Onest', 'Figtree', 'system-ui', 'sans-serif'] },
    },
  },
}
```

---

## 11. Instructions for the AI Agent

**Do**

- Build every screen from the tokens and components above.
- Choose layouts that fit the actual task (forms for registration, queues for waiting lists, tables or list rows for inventory, charts for analytics). Use the card grid and bento rhythm for composition.
- Keep one dark-green primary action per view.
- Use one gradient feature panel at most, and only where it adds value.
- Reuse components; if a new component is needed, derive it from the nearest existing one (radius, padding, type size, colour).
- Keep real product copy and data; never paste the reference's sample names, numbers or labels.

**Don't**

- Do not reproduce the reference dashboard's layout, section list or widget arrangement.
- Do not use all-caps labels, heavy borders, pure black, hard shadows, or saturated blue/red as brand colours.
- Do not use text smaller than 12px, even where the reference does.
- Do not add decorative animation, gradients on ordinary cards, or emoji.
- Do not mix in other fonts or icon styles.

**Before finishing any screen, check:**

1. Only tokens from this file are used (no stray hex values).
2. Radii follow 24 / 16 / 12 / pill.
3. Type sizes come from the scale in §2.2, with no all-caps.
4. One primary action; status always has text.
5. Contrast, focus rings, tap targets and responsive behaviour pass §8 and §3.