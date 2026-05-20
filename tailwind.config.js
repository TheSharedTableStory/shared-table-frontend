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
