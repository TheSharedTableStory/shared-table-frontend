/** Owner-approved 2026-05-02: Tailwind toolchain set up so utility classes
 * used across the codebase are actually compiled. Brand tokens taken from the
 * frozen css/tailwind.css that previously held them: tsts-clay rgb(194 141 107),
 * tsts-ink rgb(31 41 51), tsts-cream rgb(245 237 230), tsts-soft rgb(253 249 245).
 *
 * Build: `npx tailwindcss -i tailwind-input.css -o css/tailwind.css --minify`
 */
module.exports = {
  content: [
    './*.html',
    './js/**/*.js',
    './data/**/*.js'
  ],
  // Owner 2026-06-01: safelist of utility patterns that may appear in
  // JS-generated class strings or temporarily-removed source. Without this,
  // any class only referenced in dynamic markup (e.g. createElement().className
  // strings built per-render) can be purged by JIT. The patterns below cover
  // the common utility categories I've hit during development:
  //   - colour utilities for the brand-ish palette in 50–900 shades
  //   - position + sizing utilities used in absolute-positioned overlays
  //   - aspect ratios for image containers
  //   - tracking, grid-cols, gap — common layout tools
  // Adds ~2KB to the compiled CSS; trades disk for "it just works" DX.
  safelist: [
    { pattern: /^(bg|text|border|ring)-(slate|gray|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900)$/ },
    // Stale-stylesheet guard 2026-08-10 (frontend-class-resolution-runtime.test.js):
    // these four were applied in my-bookings.js but never compiled — they rendered
    // NOTHING while looking correct in source. Variant-prefixed classes need literal
    // safelist entries because the JS content scan misses runtime-composed strings.
    'disabled:bg-gray-50', 'md:px-12', 'md:py-16', 'md:text-3xl',
    // Opacity variants — literal entries because JIT slash-handling in safelist
    // patterns is finicky. Add new combos here as the codebase needs them.
    'bg-blue-600/95', 'bg-blue-600/90', 'bg-blue-600/80',
    'bg-orange-500/95', 'bg-orange-500/90', 'bg-orange-500/80',
    'bg-emerald-600/95', 'bg-emerald-600/90', 'bg-emerald-600/80',
    'bg-amber-500/95', 'bg-amber-500/90', 'bg-amber-500/80',
    'bg-red-600/95', 'bg-red-600/90', 'bg-red-600/80',
    'bg-slate-900/80', 'bg-slate-900/70', 'bg-slate-900/60', 'bg-slate-900/40',
    'bg-black/80', 'bg-black/70', 'bg-black/60', 'bg-black/50', 'bg-black/40',
    'bg-white/95', 'bg-white/90', 'bg-white/85', 'bg-white/80', 'bg-white/70',
    // Position fractions — same finicky slash issue.
    'top-1/2', 'left-1/2', 'right-1/2', 'bottom-1/2',
    'top-1/3', 'top-2/3', 'left-1/3', 'left-2/3',
    '-translate-x-1/2', '-translate-y-1/2', 'translate-x-1/2', 'translate-y-1/2',
    'translate-x-full', '-translate-x-full',
    // Integer position utilities (covered by pattern but explicit for clarity).
    { pattern: /^(top|right|bottom|left)-(0|1|2|3|4|5|6)$/ },
    // Sizes
    { pattern: /^(h|w|min-h|min-w|max-h|max-w)-(0|1|2|3|4|5|6|7|8|9|10|11|12|14|16|20|24|32|40|48|56|64|72|80|96)$/ },
    // Aspect ratios — `square`, `video`, and explicit arbitrary values.
    // Arbitrary-value patterns with `[...]` syntax don't work in safelist
    // regex; list literals instead.
    'aspect-square', 'aspect-video', 'aspect-auto',
    'aspect-[16/9]', 'aspect-[9/16]', 'aspect-[4/3]', 'aspect-[3/4]',
    'aspect-[3/2]', 'aspect-[2/3]', 'aspect-[1/1]', 'aspect-[21/9]',
    // Typography spacing
    { pattern: /^tracking-(tighter|tight|normal|wide|wider|widest)$/ },
    { pattern: /^leading-(none|tight|snug|normal|relaxed|loose)$/ },
    // Grid + flex layout
    { pattern: /^grid-cols-(1|2|3|4|5|6|7|8|9|10|11|12)$/ },
    { pattern: /^grid-rows-(1|2|3|4|5|6)$/ },
    { pattern: /^gap-(0|1|2|3|4|5|6|8|10|12|16|20|24)$/ },
    { pattern: /^col-span-(1|2|3|4|5|6|7|8|9|10|11|12|full)$/ },
    { pattern: /^row-span-(1|2|3|4|5|6|full)$/ },
  ],
  theme: {
    extend: {
      colors: {
        tsts: {
          clay:   'rgb(194 141 107)',  // brand orange-brown
          ink:    'rgb(31 41 51)',     // brand near-black
          cream:  'rgb(245 237 230)',  // warm background
          soft:   'rgb(253 249 245)',  // softer cream variant
          brown:  'rgb(122 84 60)',    // deeper brand brown
          sand:   'rgb(229 215 196)'   // sand accent
        }
      },
      boxShadow: {
        'soft-card': '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(31,41,51,0.06)'
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
