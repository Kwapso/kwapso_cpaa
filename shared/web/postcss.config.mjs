// The PostCSS pipeline BOTH front doors build through. Each app's own
// postcss.config.mjs re-exports this, because Next only looks for the file at an
// app's root — and two byte-identical build configs is two chances to upgrade
// Tailwind on one door and not the other.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
