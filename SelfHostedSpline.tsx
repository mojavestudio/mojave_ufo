// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

// Lazy import so Framer's first paint stays light
const Spline = React.lazy(() => import("@splinetool/react-spline"))

type Breakpoint = "mobile" | "tablet" | "desktop"

type Props = {
  /** e.g. https://mojavestudio.github.io/mojave_ufo/ (must end with / or we'll add it) */
  gitHubBaseUrl: string
  /** Mobile scene file (≤640px) */
  mobileFileName: string
  /** Tablet scene file (641px - 1024px) */
  tabletFileName: string
  /** Desktop scene file (≥1025px) */
  desktopFileName: string
  /** Optional fallback from Spline Export → Code → React (https://prod.spline.design/.../scene.splinecode) */
  splineProdUrl: string

  /** Intrinsic aspect ratio (height follows width) */
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

/** Wait for the element's size to stop changing for `quietMs` before returning "stable". */
function useStableSize(
  ref: React.RefObject<HTMLElement>,
  quietMs = 250
): { width: number; height: number; stable: boolean } {
  const [box, setBox] = React.useState({ width: 0, height: 0 })
  const [stable, setStable] = React.useState(false)
  const timer = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      setBox({ width: cr.width, height: cr.height })
      setStable(false)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setStable(true), quietMs)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [ref, quietMs])

  return { ...box, stable }
}

export default function SelfHostedSpline(props: Props) {
  const {
    gitHubBaseUrl = "https://mojavestudio.github.io/mojave_ufo/",
    mobileFileName = "scene-mobile.splinecode",
    tabletFileName = "scene.splinecode",
    desktopFileName = "scene.splinecode",
    splineProdUrl = "",

    aspectWidth = 16,
    aspectHeight = 9,

    renderOnDemand = true,
    mountWhenInView = true,
    preflightCheck = true,

    zoom = 1,
    fallbackMessage = "Spline scene URL failed to load (404/blocked). Check the path or host.",
    className,
  } = props

  const isStatic = useIsStaticRenderer()
  const outerRef = React.useRef<HTMLDivElement | null>(null)

  const [inView, setInView] = React.useState<boolean>(!mountWhenInView)
  const [resolvedUrl, setResolvedUrl] = React.useState<string>("")
  const [error, setError] = React.useState<string>("")

  // ——— Breakpoints (purely for file selection) ———
  const [bp, setBp] = React.useState<Breakpoint>("desktop")
  React.useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      setBp(w <= 640 ? "mobile" : w <= 1024 ? "tablet" : "desktop")
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const sceneFile = React.useMemo(() => {
    if (bp === "mobile") return mobileFileName
    if (bp === "tablet") return tabletFileName
    return desktopFileName
  }, [bp, mobileFileName, tabletFileName, desktopFileName])

  // ——— Build URL (self-hosted first, then prod fallback) ———
  const ghUrl = React.useMemo(() => {
    const base = (gitHubBaseUrl || "").replace(/\/+$/, "") + "/"
    return base + (sceneFile || "").replace(/^\/+/, "")
  }, [gitHubBaseUrl, sceneFile])

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

  // ——— Only mount when in view (prevents overlapping Three scenes in Framer) ———
  React.useEffect(() => {
    if (!mountWhenInView || !outerRef.current) return
    const node = outerRef.current
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { root: null, rootMargin: "200px 0px", threshold: 0.01 }
    )
    io.observe(node)
    return () => io.disconnect()
  }, [mountWhenInView])

  // ——— Stabilize parent size before mounting Spline (prevents "post-load jump") ———
  const { stable } = useStableSize(outerRef, 250)

  // Outermost wrapper rules:
  //  - width is driven by Framer (your frame)
  //  - height is derived from width via CSS aspect-ratio (no vh, no manual pixels)
  //  - we isolate layout to avoid external reflow nudging our size mid-init
  const outerStyle: React.CSSProperties = {
    width: "100%",
    aspectRatio: `${Math.max(1, aspectWidth)} / ${Math.max(1, aspectHeight)}`,
    position: "relative",
    overflow: "hidden",
    // Contain layout/size/paint so external layout churn won't thrash us:
    contain: "layout size style paint",
    // Prevent iOS scroll chaining side-effects around tall canvases:
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
  }

  // Inner absolutely fills the aspect box, so <Spline> can be 100%x100%
  const innerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "block",
  }

  // During static canvas/exports, show a lightweight placeholder (no WebGL)
  if (isStatic) {
    return (
      <div ref={outerRef} className={className} style={outerStyle}>
        <div style={{ ...innerStyle, display: "grid", placeItems: "center" }}>
          <div style={{ opacity: 0.6, fontSize: 12 }}>Spline preview (static)</div>
        </div>
      </div>
    )
  }

  const canMount = (!mountWhenInView || inView) && stable && resolvedUrl && !error

  return (
    <div ref={outerRef} className={className} style={outerStyle}>
      <div style={innerStyle}>
        <React.Suspense fallback={<div style={{ padding: 12 }}>Loading 3D…</div>}>
          {error ? (
            <div style={{ padding: 12, fontSize: 14, lineHeight: 1.4 }}>
              {fallbackMessage}
              <br />
              <code style={{ fontSize: 12 }}>{error}</code>
            </div>
          ) : canMount ? (
            <Spline
              scene={resolvedUrl}
              renderOnDemand={renderOnDemand}
              // Important: make sure the wrapper controls size; Spline fills it.
              style={{ width: "100%", height: "100%", display: "block" }}
              onLoad={(app) => {
                try {
                  if (Number.isFinite(zoom) && zoom > 0) app.setZoom(zoom)
                } catch {
                  /* ignore */
                }
              }}
            />
          ) : null}
        </React.Suspense>
      </div>
    </div>
  )
}

addPropertyControls(SelfHostedSpline, {
  gitHubBaseUrl: {
    type: ControlType.String,
    title: "GitHub Base",
    defaultValue: "https://mojavestudio.github.io/mojave_ufo/",
    placeholder: "https://<user>.github.io/<project>/",
  },
  mobileFileName: {
    type: ControlType.String,
    title: "Mobile Scene (≤640px)",
    defaultValue: "scene-mobile.splinecode",
  },
  tabletFileName: {
    type: ControlType.String,
    title: "Tablet Scene (641–1024px)",
    defaultValue: "scene.splinecode",
  },
  desktopFileName: {
    type: ControlType.String,
    title: "Desktop Scene (≥1025px)",
    defaultValue: "scene.splinecode",
  },
  splineProdUrl: {
    type: ControlType.String,
    title: "Spline Fallback",
    defaultValue: "",
    placeholder: "https://prod.spline.design/ID/scene.splinecode",
  },
  aspectWidth: {
    type: ControlType.Number,
    title: "Aspect W",
    defaultValue: 16,
    min: 1,
    step: 1,
    displayStepper: true,
  },
  aspectHeight: {
    type: ControlType.Number,
    title: "Aspect H",
    defaultValue: 9,
    min: 1,
    step: 1,
    displayStepper: true,
  },
  renderOnDemand: {
    type: ControlType.Boolean,
    title: "Render On Demand",
    defaultValue: true,
  },
  mountWhenInView: {
    type: ControlType.Boolean,
    title: "Mount In View",
    defaultValue: true,
  },
  preflightCheck: {
    type: ControlType.Boolean,
    title: "Check URL (HEAD)",
    defaultValue: true,
  },
  zoom: {
    type: ControlType.Number,
    title: "Zoom",
    min: 0.1,
    max: 5,
    step: 0.1,
    displayStepper: true,
    defaultValue: 1,
  },
  fallbackMessage: {
    type: ControlType.String,
    title: "Fallback Message",
    defaultValue:
      "Spline scene URL failed to load (404/blocked). Check the path or host.",
  },
})