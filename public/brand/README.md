# FleetGrid brand files

The logo comes from the designer's brand identity (November 2026, `Brand identity.pdf`): the FG
mark beside FLEETGRID in a bold slanted face, outlined so nothing depends on a font. On screen the
"LLC" line under the name is left off. Colours from the logo files: FleetGrid navy #091b35 and
industrial orange #f47b20. The identity guide lists navy #0B2D5B and orange #FF7A00; the logo files
win until the designer says otherwise.

- `fleetgrid-logo-light.svg`: full logo for light surfaces (navy and orange).
- `fleetgrid-logo-dark.svg`: full logo for navy and dark surfaces (white and orange).
- `fleetgrid-mark.svg`, `fleetgrid-mark-dark.svg`: the mark alone, for icons.
- `fleetgrid-favicon-32.svg`: the favicon, the white mark on a navy tile (guide page 2).

The app draws the header logo from `src/components/shared/Logo.tsx` (geometry in
`logo-geometry.ts`, generated from the designer's "Logo Main" SVG), the tab icon from
`src/app/icon.svg`, the home-screen icon from `src/app/apple-icon.png` and `public/favicon.ico`.
