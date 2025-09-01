# Mojave UFO — Static Spline Scene

Minimal static setup to host a Spline scene on GitHub Pages and embed it in Framer while preserving scroll-triggered animation (authored in Spline).

Keep these files at the repo root:
- `index.html`
- `scene.splinecode`
- `process.js`
- `process.wasm`
- `.nojekyll`

## GitHub Pages + Framer Embed

This repo can also serve a standalone Spline scene via GitHub Pages and be embedded in Framer as a Code Component while preserving scroll-triggered animations authored in Spline.

### 1) Prepare files (repo root)
- Add the following files from your Spline export to the repo root:
  - `scene.splinecode`
  - `process.js`
  - `process.wasm`
- An `index.html` is already included at the repo root and references `./scene.splinecode` using the Spline Viewer web component.

`index.html` content for reference:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Spline Scene</title>
    <!-- Load the Spline Viewer web component -->
    <script type="module" src="https://unpkg.com/@splinetool/viewer@1.10.53/build/spline-viewer.js"></script>
    <style>
      html, body { margin: 0; height: 100%; }
      #wrap { height: 100vh; }
    </style>
  </head>
  <body>
    <div id="wrap">
      <spline-viewer url="./scene.splinecode" style="width:100%; height:100%"></spline-viewer>
    </div>
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
