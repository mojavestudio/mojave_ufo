# Mojave UFO

This folder bundles two pieces that work together inside our Mojave UFO concept:

- **MojaveGlobe.tsx** – a Framer code component backed by globe.gl + Three.js.
- **index.html + Spline assets** – a static viewer that can be hosted (for example on GitHub Pages) and embedded in Framer.

## MojaveGlobe (Framer code component)

Interactive globe that loads its libraries on demand, aligns camera framing with padding, and can route between cities using geocoding.

### Highlights
- Single-shot loader caches globe.gl + Three.js between component instances.
- Responsive sizing: globe radius, DPR, and camera altitude adjust whenever the frame or padding changes.
- Scroll-driven motion modes (`Rotate`, `Spin (Page Scroll)`, and the route presets) that respect viewport entry before animating.
- Marker system with geocoding fallback (OpenCage → Open-Meteo → curated city list) and memoised results during a session.
- Pin geometry rendered with Three.js, supporting four styles, custom scale, colours, and altitude offsets.

### Drop it into Framer
1. Create a new **Code File** and paste the contents of `MojaveGlobe.tsx`.
2. If you have your own OpenCage key, paste it into the *OpenCage Key* control; otherwise the built-in key is rate-limited to light testing.
3. Add the component to a frame and tweak the properties panel. All controls in `addPropertyControls` are documented inline.
4. Set `Markers` to the cities you care about. The component geocodes on first mount and caches coordinates while the tab is open.

### Key props worth noting
- `fitPaddingPx` – matches Framer padding. The component now recomputes camera altitude each time you change it, so animating the slider will visually resize the globe without lingering "hydrated" states.
- `renderScale` – multiplies the device pixel ratio (capped at 3). Higher values sharpen at the cost of GPU time.
- `movement` & `scrollSpinDegPer1000px` – pick how the globe reacts to scroll or rotation.
- `startLocation`/`endLocation` – human-readable names (city or marker label) that resolve to coordinates through the cached geocoder.
- `markers` – array of per-city settings for geometry, colours, and altitude tweaks.

### Development notes
- Helper utilities (`computeFitAltitude`, `computePixelRatio`, `ensureMinAltitude`) centralise the sizing math so padding or DPR changes use the same logic everywhere.
- `renderScale` is normalised once with `normalizeRenderScale` and reused inside effects to avoid recomputing the same clamps.
- Library loading is idempotent across component instances via a global cache key.

## Static Spline host (optional)

The bundled `index.html`, `scene.splinecode`, `process.js`, `process.wasm`, and `vendor/` folder let you self-host a Spline scene.

### Deploying quickly
1. Export your scene from Spline and replace the matching files in this folder.
2. Commit everything and push to a Git provider (GitHub Pages works out of the box).
3. Point the `url` attribute in `index.html` (or via query params) at the correct `.splinecode` file.

### Embedding inside Framer
- Drop the hosted URL in an `<iframe>` or use Framer's Spline component.
- The page listens for parent `postMessage` events (`SCROLL_RANGE`, `SCROLL_PROGRESS`) so you can sync scroll if needed.
- Without a parent messenger, it falls back to an internally managed sticky scroll experience.

Feel free to strip the Spline portion if you only need the globe – everything is self-contained per file and documented above.
