# FleetGrid brand files

The logo: the name painted on the side of an orange trailer, a graphite cab, no road. Wordmark in
Barlow Condensed Bold, tracked 6%, outlined so nothing depends on a font. Colours are the Workshop
tokens: orange #b84a00 on light surfaces and #f08a3c on graphite, graphite #1f2328, ink #16191d.

- `fleetgrid-logo-light.svg`: full logo for light surfaces.
- `fleetgrid-logo-dark.svg`: full logo for graphite and dark surfaces.
- `fleetgrid-mark.svg`, `fleetgrid-mark-dark.svg`: the silhouette alone, for icons.
- `fleetgrid-favicon-32.svg`: the favicon.

The app draws the header logo from `src/components/shared/Logo.tsx` (geometry in
`logo-geometry.ts`, generated from the same source), the tab icon from `src/app/icon.svg` and the
home-screen icon from `src/app/apple-icon.png`.
