import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

// Keep React as peer; lazy-load Spline
const Spline = React.lazy(() => import("@splinetool/react-spline"))

type Breakpoint = "mobile" | "tablet" | "desktop"

type Props = {
  gitHubBaseUrl: string
  mobileFileName: string
  tabletFileName: string
  desktopFileName: string
  splineProdUrl: string

  /** Aspect ratio controls */
  aspectPreset: "16:9" | "4:3" | "3:2" | "1:1" | "9:16" | "21:9" | "Custom"
  aspectCustom: string // e.g. "1200:800" or "1.6"

  /** Performance */
  renderOnDemand: boolean
  mountWhenInView: boolean
  preflightCheck: boolean

  /** Behavior */
  freezeHeightAfterLoad: boolean

  /** Optional */
  zoom: number
  fallbackMessage: string
  className?: string
}

function parseAspect(input: string): number {
  if (!input) return 16 / 9
  const txt = String(input).trim()
  const m = txt.match(/^(\d+(?:\.\d+)?)[\s:\/]+(\d+(?:\.\d+)?)$/)
  if (m) {
    const w = parseFloat(m[1])
    const h = parseFloat(m[2])
    return h > 0 ? w / h : 16 / 9
  }
  const num = Number(txt)
  return Number.isFinite(num) && num > 0 ? num : 16 / 9
}

export default function SelfHostedSpline(props: Props) {
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

    freezeHeightAfterLoad = true,

    zoom = 1,
    fallbackMessage = "Spline scene URL failed to load (404/blocked). Check the path or host.",
    className,
  } = props

  const isStatic = useIsStaticRenderer()
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  const [bp, setBp] = React.useState<Breakpoint>("desktop")
  const [inView, setInView] = React.useState<boolean>(!mountWhenInView)
  const [resolvedUrl, setResolvedUrl] = React.useState<string>("")
  const [error, setError] = React.useState<string>("")
  const [loaded, setLoaded] = React.useState(false)

  // ——— Breakpoints -> which file
  React.useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      setBp(w <= 640 ? "mobile" : w <= 1024 ? "tablet" : "desktop")
    }
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const sceneFile = React.useMemo(() => {
    return bp === "mobile" ? mobileFileName : bp === "tablet" ? tabletFileName : desktopFileName
  }, [bp, mobileFileName, tabletFileName, desktopFileName])

  // ——— Build GH URL
  const ghUrl = React.useMemo(() => {
    const base = (gitHubBaseUrl || "").replace(/\/+$/, "") + "/"
    return base + (sceneFile || "").replace(/^\/+/, "")
  }, [gitHubBaseUrl, sceneFile])

  // ——— Preflight HEAD/GET to avoid runtime 404 churn
  React.useEffect(() => {
    let cancelled = false
    setError("")
    setResolvedUrl("")

    async function ok(url: string) {
      try {
        const h = await fetch(url, { method: "HEAD", cache: "no-store", mode: "cors" as RequestMode })
        if (h.ok) return true
      } catch {}
      try {
        const g = await fetch(url, { method: "GET", cache: "no-store", mode: "cors" as RequestMode })
        return g.ok
      } catch {
        return false
      }
    }

    ;(async () => {
      if (!preflightCheck) {
        setResolvedUrl(ghUrl || splineProdUrl)
        return
      }
      if (ghUrl && (await ok(ghUrl))) {
        if (!cancelled) setResolvedUrl(ghUrl)
        return
      }
      if (splineProdUrl && (await ok(splineProdUrl))) {
        if (!cancelled) setResolvedUrl(splineProdUrl)
        return
      }
      if (!cancelled) {
        setResolvedUrl(ghUrl || splineProdUrl || "")
        setError(`Could not load: ${ghUrl || splineProdUrl || "(no url)"}`)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ghUrl, splineProdUrl, preflightCheck])

  // ——— Mount only when visible (avoid multiple WebGLs)
  React.useEffect(() => {
    if (!mountWhenInView || !rootRef.current) return
    const node = rootRef.current
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      root: null,
      rootMargin: "200px 0px",
      threshold: 0.01,
    })
    io.observe(node)
    return () => io.disconnect()
  }, [mountWhenInView])

  // ——— Height = width / aspectRatio   (computed with ResizeObserver)
  const aspect = aspectPreset === "Custom" ? parseAspect(aspectCustom) : parseAspect(aspectPreset)
  const [pxHeight, setPxHeight] = React.useState<number>(() => {
    // initial guess for Framer canvas to avoid a 0→N jump
    const defaultWidth = (SelfHostedSpline as any).defaultProps?.width ?? 1200
    return Math.round(defaultWidth / aspect)
  })

  React.useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return

    const ro = new ResizeObserver(entries => {
      if (freezeHeightAfterLoad && loaded) return // stop reacting after first load if requested
      const width = entries[0].contentRect.width
      if (width > 0) {
        const h = Math.max(1, Math.round(width / aspect))
        // only update when different to avoid reflows
        setPxHeight(prev => (Math.abs(prev - h) > 0.5 ? h : prev))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect, loaded, freezeHeightAfterLoad])

  // ——— Render
  if (isStatic) {
    return (
      <div ref={rootRef} className={className} style={{ width: "100%", height: pxHeight, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 12, opacity: 0.6 }}>
          Spline preview (static)
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className={className} style={{ width: "100%", height: pxHeight, position: "relative", overflow: "hidden" }}>
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
            onLoad={(app) => {
              try {
                if (Number.isFinite(zoom) && zoom > 0) app.setZoom(zoom)
              } catch {}
              setLoaded(true) // optional: stop height reactions if freezeHeightAfterLoad = true
            }}
            style={{ width: "100%", height: "100%" }}
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
  splineProdUrl: { type: ControlType.String, title: "Spline Fallback", defaultValue: "", placeholder: "https://prod.spline.design/ID/scene.splinecode" },

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

  freezeHeightAfterLoad: { type: ControlType.Boolean, title: "Freeze Height After Load", defaultValue: true },

  zoom: { type: ControlType.Number, title: "Zoom", min: 0.1, max: 5, step: 0.1, defaultValue: 1 },
  fallbackMessage: { type: ControlType.String, title: "Fallback Message", defaultValue: "Spline scene URL failed to load (404/blocked). Check the path or host." },
})

// Give Framer a sane initial box; height is derived from width
;(SelfHostedSpline as any).defaultProps = { width: 1200, height: Math.round(1200 / (16 / 9)) }