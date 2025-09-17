import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

// Lazy import so React stays a peer
const Spline = React.lazy(() => import("@splinetool/react-spline"))

type BP = "mobile" | "tablet" | "desktop"
type FreezeStrategy = "none" | "onLoad" | "stable"

type Props = {
  gitHubBaseUrl: string
  mobileFileName: string
  tabletFileName: string
  desktopFileName: string
  splineProdUrl: string

  /** Aspect ratio: height = width / ratio */
  aspectPreset: "16:9" | "4:3" | "3:2" | "1:1" | "9:16" | "21:9" | "Custom"
  aspectCustom: string // "1200:800" | "1.5" | "16:9"

  /** Performance */
  renderOnDemand: boolean
  mountWhenInView: boolean
  preflightCheck: boolean

  /** Resize behavior */
  freezeStrategy: FreezeStrategy
  stabilityMs: number // for "stable" strategy

  /** Optional */
  zoom: number
  fallbackMessage: string
  className?: string
}

function parseAspect(input: string): number {
  const s = (input || "").trim()
  const m = s.match(/^(\d+(?:\.\d+)?)[\s:\/]+(\d+(?:\.\d+)?)$/)
  if (m) {
    const w = parseFloat(m[1]); const h = parseFloat(m[2])
    return h > 0 ? w / h : 16 / 9
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : 16 / 9
}

export default function SelfHostedSpline(p: Props) {
  const {
    gitHubBaseUrl = "https://mojavestudio.github.io/mojave_ufo/",
    mobileFileName = "scene-mobile.splinecode",
    tabletFileName = "scene.splinecode",
    desktopFileName = "scene.splinecode",
    splineProdUrl = "",

    aspectPreset = "16:9",
    aspectCustom = "16:9",

    renderOnDemand = true,
    mountWhenInView = true,
    preflightCheck = true,

    freezeStrategy = "stable",
    stabilityMs = 250,

    zoom = 1,
    fallbackMessage = "Spline scene URL failed to load (404/blocked). Check the path or host.",
    className,
  } = p

  const isStatic = useIsStaticRenderer()
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  // Breakpoint → choose which file
  const [bp, setBp] = React.useState<BP>("desktop")
  React.useEffect(() => {
    const onR = () => {
      const w = window.innerWidth
      setBp(w <= 640 ? "mobile" : w <= 1024 ? "tablet" : "desktop")
    }
    onR(); window.addEventListener("resize", onR)
    return () => window.removeEventListener("resize", onR)
  }, [])

  const sceneFile = bp === "mobile" ? mobileFileName : bp === "tablet" ? tabletFileName : desktopFileName
  const ghUrl = React.useMemo(() => {
    const base = (gitHubBaseUrl || "").replace(/\/+$/, "") + "/"
    return base + (sceneFile || "").replace(/^\/+/, "")
  }, [gitHubBaseUrl, sceneFile])

  // Preflight (avoid 404 churn)
  const [resolvedUrl, setResolvedUrl] = React.useState("")
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    let cancelled = false
    setResolvedUrl(""); setError("")

    async function ok(url: string) {
      try { const h = await fetch(url, { method: "HEAD", cache: "no-store", mode: "cors" as RequestMode }); if (h.ok) return true } catch {}
      try { const g = await fetch(url, { method: "GET", cache: "no-store", mode: "cors" as RequestMode }); return g.ok } catch { return false }
    }

    ;(async () => {
      if (!preflightCheck) { setResolvedUrl(ghUrl || splineProdUrl); return }
      if (ghUrl && (await ok(ghUrl))) { if (!cancelled) setResolvedUrl(ghUrl); return }
      if (splineProdUrl && (await ok(splineProdUrl))) { if (!cancelled) setResolvedUrl(splineProdUrl); return }
      if (!cancelled) { setResolvedUrl(ghUrl || splineProdUrl || ""); setError(`Could not load: ${ghUrl || splineProdUrl || "(no url)"}`) }
    })()

    return () => { cancelled = true }
  }, [ghUrl, splineProdUrl, preflightCheck])

  // In-view mount (avoid multiple WebGLs)
  const [inView, setInView] = React.useState<boolean>(!mountWhenInView)
  React.useEffect(() => {
    if (!mountWhenInView || !rootRef.current) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "200px 0px", threshold: 0.01 })
    io.observe(rootRef.current); return () => io.disconnect()
  }, [mountWhenInView])

  // Aspect ratio via CSS (browser computes height from width)
  const ratio = aspectPreset === "Custom" ? parseAspect(aspectCustom) : parseAspect(aspectPreset)
  
  // convert numeric ratio back to "w / h" string to keep precision:
  function ratioToString(r: number): string {
    // Find a nice pair; fallback to N / 1 for odd ratios
    const presets: Array<[number, string]> = [
      [16/9, "16 / 9"], [4/3, "4 / 3"], [3/2, "3 / 2"], [1, "1 / 1"], [9/16, "9 / 16"], [21/9, "21 / 9"]
    ]
    const found = presets.find(([v]) => Math.abs(v - r) < 0.001)
    return found ? found[1] : `${r} / 1`
  }
  const aspectCss = ratioToString(ratio)

  // Optional "freeze height" to prevent late layout reflows changing size
  const [frozenPxHeight, setFrozenPxHeight] = React.useState<number | null>(null)
  const [loaded, setLoaded] = React.useState(false)

  // Stable-width freeze (no width change for stabilityMs)
  React.useEffect(() => {
    if (freezeStrategy !== "stable") return
    const el = rootRef.current; if (!el) return
    let t: any = null
    let lastWidth = 0

    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width)
      if (w !== lastWidth) {
        lastWidth = w
        if (t) clearTimeout(t)
        t = setTimeout(() => {
          if (!el) return
          const width = el.clientWidth
          if (width > 0) setFrozenPxHeight(Math.max(1, Math.round(width / ratio)))
        }, Math.max(0, stabilityMs))
      }
    })
    ro.observe(el)
    return () => { ro.disconnect(); if (t) clearTimeout(t) }
  }, [freezeStrategy, stabilityMs, ratio])

  // Freeze right after Spline loads (camera fully initialized)
  const onSplineLoad = React.useCallback((app: any) => {
    try { if (Number.isFinite(zoom) && zoom > 0) app.setZoom(zoom) } catch {}
    setLoaded(true)
    if (freezeStrategy === "onLoad") {
      const el = rootRef.current
      if (el) {
        const width = el.clientWidth
        if (width > 0) setFrozenPxHeight(Math.max(1, Math.round(width / ratio)))
      }
    }
  }, [freezeStrategy, zoom, ratio])

  // Styles:
  // - When frozen → explicit px height; otherwise → CSS aspect-ratio governs height
  const wrapperStyle: React.CSSProperties = frozenPxHeight
    ? { width: "100%", height: frozenPxHeight, position: "relative", overflow: "hidden" }
    : { width: "100%", aspectRatio: aspectCss, position: "relative", overflow: "hidden" }

  // Static render placeholder
  if (isStatic) {
    return (
      <div ref={rootRef} className={className} style={wrapperStyle}>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 12, opacity: 0.6 }}>
          Spline preview (static)
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className={className} style={wrapperStyle}>
      <React.Suspense fallback={<div style={{ padding: 12 }}>Loading 3D…</div>}>
        {error ? (
          <div style={{ padding: 12, fontSize: 14, lineHeight: 1.4 }}>
            {fallbackMessage}
            <br />
            <code style={{ fontSize: 12 }}>{error}</code>
          </div>
        ) : inView && resolvedUrl ? (
          <Spline
            scene={resolvedUrl}
            renderOnDemand={renderOnDemand}
            onLoad={onSplineLoad}
            // Important: let the canvas fill our controlled box
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        ) : null}
      </React.Suspense>
    </div>
  )
}

/** Framer Controls */
addPropertyControls(SelfHostedSpline, {
  gitHubBaseUrl: { type: ControlType.String, title: "GitHub Base", defaultValue: "https://mojavestudio.github.io/mojave_ufo/" },
  mobileFileName: { type: ControlType.String, title: "Mobile Scene (≤640px)", defaultValue: "scene-mobile.splinecode" },
  tabletFileName: { type: ControlType.String, title: "Tablet Scene (641–1024px)", defaultValue: "scene.splinecode" },
  desktopFileName: { type: ControlType.String, title: "Desktop Scene (≥1025px)", defaultValue: "scene.splinecode" },
  splineProdUrl: { type: ControlType.String, title: "Spline Fallback", defaultValue: "" },

  aspectPreset: {
    type: ControlType.Enum, title: "Aspect Ratio",
    options: ["16:9", "4:3", "3:2", "1:1", "9:16", "21:9", "Custom"],
    defaultValue: "16:9",
  },
  aspectCustom: {
    type: ControlType.String, title: "Custom (w:h or number)", defaultValue: "16:9",
    hidden: (p) => p.aspectPreset !== "Custom",
  },

  renderOnDemand: { type: ControlType.Boolean, title: "Render On Demand", defaultValue: true },
  mountWhenInView: { type: ControlType.Boolean, title: "Mount In View", defaultValue: true },
  preflightCheck: { type: ControlType.Boolean, title: "Check URL (HEAD)", defaultValue: true },

  freezeStrategy: {
    type: ControlType.Enum, title: "Freeze Height",
    options: ["none", "onLoad", "stable"], optionTitles: ["Never", "After Spline Loads", "After Width Stabilizes"],
    defaultValue: "stable",
  },
  stabilityMs: {
    type: ControlType.Number, title: "Stability Window (ms)", min: 50, max: 1000, step: 50, defaultValue: 250,
    hidden: (p) => p.freezeStrategy !== "stable",
  },

  zoom: { type: ControlType.Number, title: "Zoom", min: 0.1, max: 5, step: 0.1, defaultValue: 1 },
  fallbackMessage: { type: ControlType.String, title: "Fallback Message", defaultValue: "Spline scene URL failed to load (404/blocked). Check the path or host." },
})

// Give Framer a sane initial box; height will be governed by aspect ratio
;(SelfHostedSpline as any).defaultProps = { width: 1200, height: Math.round(1200 / (16 / 9)) }