// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

// NOTE: useMeasuredSize is the Framer-supported ResizeObserver hook
// Docs: https://www.framer.com/developers/auto-sizing  (section "Measuring Absolute Height Width Values")
import { useMeasuredSize } from "https://framer.com/m/framer/useMeasuredSize.js"

const Spline = React.lazy(() => import("@splinetool/react-spline"))

type Props = {
  /** Base like https://<user>.github.io/<project>/ (trailing slash optional) */
  gitHubBaseUrl: string
  /** Scene file names */
  mobileFileName: string
  tabletFileName: string
  desktopFileName: string
  /** Optional prod fallback (https://prod.spline.design/.../scene.splinecode) */
  splineProdUrl: string

  /** Aspect ratio to lock height = width * (h/w) */
  aspectWidth: number
  aspectHeight: number

  /** Performance */
  renderOnDemand: boolean
  mountWhenInView: boolean
  preflightCheck: boolean

  /** Optional */
  zoom: number
  fallbackMessage: string
  className?: string
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 800
 * @framerIntrinsicHeight 450
 */
export default function SelfHostedSpline(props: Props) {
  const {
    gitHubBaseUrl = "https://mojavestudio.github.io/mojave_ufo/",
    mobileFileName = "scene-mobile.splinecode",
    tabletFileName = "scene.splinecode",
    desktopFileName = "scene.splinecode",
    splineProdUrl = "",

    // 16:9 default; change in the right panel
    aspectWidth = 16,
    aspectHeight = 9,

    renderOnDemand = true,
    mountWhenInView = true,
    preflightCheck = true,

    zoom = 1,
    fallbackMessage = "Spline scene URL failed to load (404/blocked). Check the path or host.",
    className,
    ...rest // keep prop surface compatible
  } = props

  const isStatic = useIsStaticRenderer()
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const size = useMeasuredSize(rootRef) // { width, height }

  // Which scene to use by breakpoint (simple, fast)
  const [bp, setBp] = React.useState<"mobile" | "tablet" | "desktop">("desktop")
  React.useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      setBp(w <= 640 ? "mobile" : w <= 1024 ? "tablet" : "desktop")
    }
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const sceneFile = bp === "mobile" ? mobileFileName : bp === "tablet" ? tabletFileName : desktopFileName

  // Normalize base + file -> URL
  const ghUrl = React.useMemo(() => {
    const base = (gitHubBaseUrl || "").replace(/\/+$/, "") + "/"
    return base + (sceneFile || "").replace(/^\/+/, "")
  }, [gitHubBaseUrl, sceneFile])

  // Pick a working URL (GH first, then prod), but don't trigger re-layout on failures
  const [resolvedUrl, setResolvedUrl] = React.useState<string>("")
  const [error, setError] = React.useState<string>("")

  React.useEffect(() => {
    let cancelled = false
    setError("")
    setResolvedUrl("")

    async function ok(url: string) {
      try {
        const h = await fetch(url, { method: "HEAD", cache: "no-store" })
        if (h.ok) return true
      } catch {}
      try {
        const g = await fetch(url, { method: "GET", cache: "no-store" })
        return g.ok
      } catch {
        return false
      }
    }

    ;(async () => {
      if (!preflightCheck) {
        if (!cancelled) setResolvedUrl(ghUrl || splineProdUrl)
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

  // Optional: only mount Spline when visible to avoid multiple WebGL contexts
  const [inView, setInView] = React.useState<boolean>(!mountWhenInView)
  React.useEffect(() => {
    if (!mountWhenInView || !rootRef.current) return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      root: null,
      rootMargin: "200px 0px",
      threshold: 0.01,
    })
    io.observe(rootRef.current)
    return () => io.disconnect()
  }, [mountWhenInView])

  // --- Height = f(width) lock (no aspect-ratio CSS; explicit pixels) ---
  const widthPx = Math.max(0, size?.width ?? 0)
  const lockedHeightPx =
    aspectWidth > 0 ? Math.round(widthPx * (aspectHeight / aspectWidth)) : Math.round(widthPx * (9 / 16))

  // Root style: spread Framer's style + lock the height explicitly
  const rootStyle: React.CSSProperties = {
    ...(rest as any)?.style,
    position: "relative",
    width: "100%",
    // This line creates the "height from width" lock.
    height: lockedHeightPx || undefined,
    overflow: "hidden",
    contain: "layout style size paint",
    // Remove transitions that could animate height and look like "resizing after load"
    transition: "none",
  }

  if (isStatic) {
    return (
      <div ref={rootRef} className={className} style={rootStyle}>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: 0.6, fontSize: 12 }}>
          Spline preview (static)
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className={className} style={rootStyle}>
      <React.Suspense fallback={null /* don't move layout with a fallback box */}>
        {error ? (
          <div style={{ position: "absolute", inset: 0, padding: 12, fontSize: 14, lineHeight: 1.4 }}>
            {props.fallbackMessage}
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
            }}
            className="spline-abs-fill"
          />
        ) : null}
      </React.Suspense>
      {/* Fill Spline absolutely without affecting layout */}
      <style>{`.spline-abs-fill { position:absolute; inset:0; }`}</style>
    </div>
  )
}

addPropertyControls(SelfHostedSpline, {
  gitHubBaseUrl: { type: ControlType.String, title: "GitHub Base", defaultValue: "https://mojavestudio.github.io/mojave_ufo/" },
  mobileFileName: { type: ControlType.String, title: "Mobile Scene (≤640px)", defaultValue: "scene-mobile.splinecode" },
  tabletFileName: { type: ControlType.String, title: "Tablet Scene (641–1024px)", defaultValue: "scene.splinecode" },
  desktopFileName: { type: ControlType.String, title: "Desktop Scene (≥1025px)", defaultValue: "scene.splinecode" },
  splineProdUrl: { type: ControlType.String, title: "Spline Fallback", placeholder: "https://prod.spline.design/.../scene.splinecode" },
  aspectWidth: { type: ControlType.Number, title: "AR Width", defaultValue: 16, min: 1, step: 1, displayStepper: true },
  aspectHeight: { type: ControlType.Number, title: "AR Height", defaultValue: 9, min: 1, step: 1, displayStepper: true },
  renderOnDemand: { type: ControlType.Boolean, title: "Render On Demand", defaultValue: true },
  mountWhenInView: { type: ControlType.Boolean, title: "Mount In View", defaultValue: true },
  preflightCheck: { type: ControlType.Boolean, title: "Check URL (HEAD)", defaultValue: true },
  zoom: { type: ControlType.Number, title: "Zoom", min: 0.1, max: 5, step: 0.1, displayStepper: true, defaultValue: 1 },
})