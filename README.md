# Mojave UFO — Static Spline Scene

Minimal static setup to host a Spline scene on GitHub Pages and embed it in Framer while preserving scroll-triggered animation (authored in Spline).

Keep these files at the repo root:
- `index.html`
- `scene.splinecode`
- `process.js`
- `process.wasm`
- `.nojekyll`
- Vendored viewer: `vendor/spline-viewer/build/*` (pinned)

## GitHub Pages + Framer Embed

This repo can also serve a standalone Spline scene via GitHub Pages and be embedded in Framer as a Code Component while preserving scroll-triggered animations authored in Spline.

### 1) Prepare files (repo root)
- Add the following files from your Spline export to the repo root:
  - `scene.splinecode`
  - `process.js`
  - `process.wasm`
- An `index.html` is already included at the repo root and references `./scene.splinecode` using the Spline Viewer web component.

`index.html` content (fluid + sticky, ready for Framer embed):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
    <title>Mojave UFO</title>
    <!-- Load the Spline Viewer web component (self-hosted, pinned) -->
    <script type="module" src="./vendor/spline-viewer/build/spline-viewer.js"></script>
    <style>
      html, body { margin: 0; height: 100%; background: transparent; }

      /* Viewport-sized, not parent-sized */
      #outer  { position: relative; width: 100vw; }
      #sticky { position: sticky; top: 0; width: 100vw; height: 100svh; }

      /* Kill any max-width on the web component and force it fluid */
      spline-viewer{
        width:100vw !important;
        height:100svh !important;
        max-width:none !important;
        min-width:0 !important;
        display:block !important;
        box-sizing:border-box !important;
      }
      /* If your viewer build exposes parts, keep them fluid too (harmless if not) */
      spline-viewer::part(container),
      spline-viewer::part(canvas){
        width:100% !important;
        height:100% !important;
        max-width:none !important;
      }
    </style>
  </head>
  <body>
    <section id="outer">
      <div id="sticky">
        <spline-viewer id="viewer" url="./scene.splinecode" events-target="local"></spline-viewer>
      </div>
    </section>

    <!-- Scroll sync & fallback sizing -->
    <script type="module">
      const qp    = new URLSearchParams(location.search)
      const outer = document.getElementById('outer')

      function applyFallbackHeight(){
        const px = parseInt(qp.get('scrollpx') || '0', 10)
        if (px) {
          outer.style.height = px + 'px'
        } else {
          const vh = parseFloat(qp.get('scrollvh') || '170') // harmless default
          const unit = (window.visualViewport?.height || window.innerHeight) / 100
          outer.style.height = (vh * unit) + 'px'
        }
      }
      applyFallbackHeight()

      let rangePx = null

      // Parent → child sync (when embedded with ?external=1)
      if (qp.get('external') === '1') {
        window.addEventListener('message', (e) => {
          const d = e?.data
          if (!d) return
          if (d.type === 'SCROLL_RANGE' && Number.isFinite(d.rangePx)) {
            rangePx = Math.max(0, d.rangePx)
            outer.style.height = (rangePx + window.innerHeight) + 'px'
          }
          if (d.type === 'SCROLL_PROGRESS' && Number.isFinite(d.progress)) {
            const max = document.documentElement.scrollHeight - window.innerHeight
            document.documentElement.scrollTop = d.progress * Math.max(0, max)
          }
        })

        const reapply = () => {
          if (rangePx != null) outer.style.height = (rangePx + window.innerHeight) + 'px'
        }
        window.visualViewport?.addEventListener('resize', reapply)
        window.addEventListener('orientationchange', reapply)
        window.addEventListener('resize', reapply)
      }
    </script>
  </body>
  </html>
```

> Tip: `.nojekyll` prevents Jekyll from interfering with static assets (helps with `.wasm`).

### 2) Create GitHub repo and push
- Create a new GitHub repository and push this folder.
- Ensure `index.html`, `scene.splinecode`, `process.js`, and `process.wasm` live at the root of the repository (not nested in subfolders).

### 3) Enable GitHub Pages
- Repo Settings → Pages
- Source: `main` branch, folder: `/` (root)
- Save. The site will deploy at `https://<username>.github.io/<repo>/`

### 4) Verify
- Open `https://<username>.github.io/<repo>/` (should render `index.html`)
- Open `https://<username>.github.io/<repo>/scene.splinecode` (should download or display raw scene)

### 5) Framer Code Component
Create a new Code File in your Framer project and paste:

```tsx
import { useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

export default function SplineViewer({
  url = "https://<username>.github.io/<repo>/scene.splinecode",
  className,
  style,
}: {
  url?: string
  className?: string
  style?: React.CSSProperties
}) {
  const loadedRef = useRef(false)

  useEffect(() => {
    const scriptId = "spline-viewer@1.10.53"
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script")
      s.id = scriptId
      s.type = "module"
      s.src = "https://unpkg.com/@splinetool/viewer@1.10.53/build/spline-viewer.js"
      document.head.appendChild(s)
    }
    loadedRef.current = true
  }, [])

  return (
    <div className={className} style={{ width: "100%", height: "100%", ...style }}>
      {/* @ts-ignore */}
      <spline-viewer url={url} style={{ width: "100%", height: "100%" }} />
    </div>
  )
}

addPropertyControls(SplineViewer, {
  url: { type: ControlType.String, title: "Scene URL" },
})
```

Usage in Framer:
- Drag the `SplineViewer` component onto a page.
- Size it (commonly 100% width, 100vh height).
- In the right panel, set the `Scene URL` to your GitHub Pages `scene.splinecode` URL.

### Notes
- Scroll animation must be authored in Spline (Scroll Event or timeline). Framer is just rendering the scene.
- GitHub Pages is free; no paid hosting required.
- You can extend the component with more Property Controls later (e.g., background, sticky height).

### Framer parent CSS (full‑bleed embed)
In Framer Project Settings → Code → Head (start), add:

```html
<style>
  /* Target only this repo's embed */
  iframe[src*="mojavestudio.github.io/mojave_ufo"]{
    width:100vw !important;
    max-width:100vw !important;
    min-width:100vw !important;
    height:100svh !important;
    display:block !important;
    position:relative !important;
    left:50% !important;
    transform:translateX(-50%) !important;
  }
  .framer-embed-wrapper, .framer-embed-wrapper * { overflow: visible !important; }
  /* Optional: wrap the Embed in a frame sized to 100vw x 100svh with X: calc(50% - 50vw), Clip OFF */
 </style>
```

Embed URL example:
```
https://mojavestudio.github.io/mojave_ufo/?external=1&v=7
```

### Quick verification
- In the parent page console, check the iframe spans the viewport:
  ```js
  const r = document.querySelector('iframe[src*="mojavestudio.github.io/mojave_ufo"]').getBoundingClientRect();
  ({ iframeWidth: r.width, viewport: innerWidth })
  ```
- In the iframe tab console, check the web component width equals the viewport:
  ```js
  ({ innerWidth, cssWidth: getComputedStyle(document.querySelector('spline-viewer')).width })
  ```

### Troubleshooting
- If `process.wasm` fails to load, ensure it’s at the repo root and served with `application/wasm` (GitHub Pages usually handles this automatically).
- If assets 404, check filename casing and that Pages is serving from the root.
- If changes don’t appear, hard refresh or disable cache.

### Local preview (static)
You can quickly preview the static `index.html` locally:

```bash
npx serve -p 3000 .
# then open http://localhost:3000/
```

## Publish with GitHub Desktop
- Open GitHub Desktop → File → Add Local Repository → choose this folder.
- Commit all files with a message like "Initial static Spline scene".
- Click "Publish repository" to push to GitHub (keep default branch `main`).
- On GitHub: Repo Settings → Pages → Source: Deploy from branch → `main` and `/ (root)`.
- Wait 1–2 minutes, then open:
  - `https://<username>.github.io/<repo>/`
  - `https://<username>.github.io/<repo>/scene.splinecode`

## Pinned Viewer (self-hosted)

This repo vendors the Spline Viewer so everything serves from GitHub Pages without hitting a CDN. The currently pinned version is `1.10.57` under `vendor/spline-viewer/build`.

- Update the pinned version:

```bash
./scripts/update_spline_viewer.sh 1.10.57
```

Notes:
- The viewer’s `process.js` looks for `process.wasm` in the same folder. Some published versions don’t include it under `/build`. The script falls back to copying the local `./process.wasm` into `vendor/spline-viewer/build/`.
- `index.html` already points to `./vendor/spline-viewer/build/spline-viewer.js`.
