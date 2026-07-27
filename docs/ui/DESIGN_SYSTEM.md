# ALAGA-SYS V2 design system

## Direction

The interface is calm, professional, and friendly for barangay healthcare staff.
It uses white surfaces on a soft gray-blue background, a medical blue primary,
and restrained teal success accents. Borders and shadows establish hierarchy
without glass effects, neon color, or decorative excess.

## Foundations

- **Body:** Inter with Segoe UI and system fallbacks
- **Headings:** Poppins Semibold, then Inter and system fallbacks
- **Primary:** calm medical blue for active navigation and primary actions
- **Success:** teal used only for positive states
- **Warning:** amber with dark text
- **Destructive:** accessible red
- **Surfaces:** white cards on a cool near-white background
- **Radius:** a 16px base, with smaller controls derived from it
- **Shadow:** a restrained, low-contrast card shadow
- **Motion:** short color and layout transitions; reduced-motion preferences honored

The tokens are CSS variables in `src/styles/globals.css` and are mapped into
Tailwind in `tailwind.config.js`. Chart colors are defined even though no chart
renders fabricated data in Phase 0.

## Reusable patterns

- `ContentContainer`: responsive maximum-width page boundary
- `PageHeading`: eyebrow, title, description, and action region
- `SectionHeading`: consistent card/section titles and action placement
- `StatCard`: preview-safe metric presentation
- `EmptyState`, `LoadingState`, `ErrorState`: consistent async states
- `StatusBadge`: semantic status-to-visual mapping
- `AppShell`: desktop, tablet, and mobile navigation frame
- `ConnectivityBanner`: announced offline state without discarding the current
  screen

## Accessibility

The palette maintains readable contrast, interactive controls have keyboard focus
rings, icon-only controls include accessible labels, navigation uses semantic
elements, loading and error states are announced, dialogs trap focus and remain
scrollable within the dynamic viewport, and motion is minimized when the
operating system requests it. Content must never rely on color alone to
communicate a healthcare state.

## Usage guardrails

- Use primary blue for the main action, not every clickable element.
- Prefer one clear heading per page and short supporting copy.
- Keep card radii between roughly 14 and 18 pixels.
- Use skeletons for brief loading and shared states for longer waits or no data.
- Never show sample healthcare numbers without an unmistakable preview label.
- Do not use gradients for major UI surfaces; the dashboard background effect is
  an extremely subtle single-color radial wash, not a decorative gradient panel.

## Reporting pattern

Report categories use horizontally scrollable keyboard-focusable tabs, shared
date/filter controls, responsive statistic cards, and CSS bar charts. Every
chart includes an accessible text alternative and expandable data table; color
is not the only carrier of meaning. At mobile widths controls remain reachable
and wide workload tables scroll within their card.

Print styles expose only `.report-print`, hide `.print-hidden` controls, show
report metadata and footers, repeat table headings, avoid splitting cards and
rows, and use an A4-safe monochrome surface. PDF is produced through the same
reviewable browser print layout.
