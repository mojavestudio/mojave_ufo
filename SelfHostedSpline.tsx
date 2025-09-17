// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

// Lazy import to avoid extra Reacts and keep initial render light
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

  /** Aspect ratio */
  aspectPreset: "16:9" | "4:3" | "3:2" | "1:1" | "9:16" | "21:9" | "Custom"
  aspectCustom: string // "width:height" e.g. "1200:800"

  /** Performance */
  renderOnDemand: boolean
  mountWhenInView: boolean
  preflightCheck: boolean

  /** Optional */
  zoom: number
  fallbackMessage: string
  className?: string
}

function parseAspect(input: string): number {
  // Accept "w:h", "w / h", "1.7777", etc.
  if (!input) return 16 / 9
  const cleaned = String(input).replace(/\s/g, "")
  if (cleaned.includes(":") || cleaned.includes("/")) {
    const parts = cleaned.split(/[:/]/).map(Number)
    const [w, h] = parts.length >= 2 ? parts : [16, 9]
    return !isFinite(w) || !isFinite(h) || h === 0 ? 16 / 9 : w / h
  }
  const num = Number(cleaned)
  return isFinite(num) && num > 0 ? num : 16 / 9
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

    zoom = 1,
    fallbackMessage = "Spline scene URL failed to load (404/blocked). Check the path or host.",
    className,
  } = props

  const isStatic = useIsStaticRenderer()
  const outerRef = React.useRef<HTMLDivElement | null>(null)

  const [inView, setInView] = React.useState<boolean>(!mountWhenInView)
  const [resolvedUrl, setResolvedUrl] = React.useState<string>("")
  const [error, setError] = React.useState<string>("")

  // ----- Breakpoints (no reflow flicker; just URL pick) -----
  const [bp, setBp] = React.useState<Breakpoint>("desktop")
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

  // ----- Build GH URL -----
  const ghUrl = React.useMemo(() => {
    const base = (gitHubBaseUrl || "").replace(/\/+$/, "") + "/"
    return base + (sceneFile || "").replace(/^\/+/, "")
  }, [gitHubBaseUrl, sceneFile])

  // ----- Preflight the URL to avoid runtime 404 churn -----
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

  // ----- Mount only when visible (avoid multi-Three scenes) -----
  React.useEffect(() => {
    if (!mountWhenInView || !outerRef.current) return
    const node = outerRef.current
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      root: null,
      rootMargin: "200px 0px",
      threshold: 0.01,
    })
    io.observe(node)
    return () => io.disconnect()
  }, [mountWhenInView])

  // ----- Aspect ratio (height derives from width) -----
  const ratio =
    aspectPreset === "Custom" ? parseAspect(aspectCustom) : parseAspect(aspectPreset)

  // Prefer native aspect-ratio; use padding-top fallback if missing
  const supportsAspect = React.useMemo(
    () => typeof CSS !== "undefined" && (CSS as any).supports?.("aspect-ratio: 1 / 1"),
    []
  )

  const wrapperStyle: React.CSSProperties = supportsAspect
    ? {
        width: "100%",
        aspectRatio: `${ratio}`,
        position: "relative",
        overflow: "hidden",
      }
    : {
        width: "100%",
        position: "relative",
        overflow: "hidden",
        // padding-top fallback: height = width / ratio  ->  h/w = 1/ratio -> %
        paddingTop: `${(1 / ratio) * 100}%`,
      }

  const innerStyle: React.CSSProperties = supportsAspect
    ? { position: "absolute", inset: 0 }
    : { position: "absolute", inset: 0 }

  // ----- Static canvas (Editor thumbnails / exports) -----
  if (isStatic) {
    return (
      <div ref={outerRef} className={className} style={wrapperStyle}>
        <div style={{ ...innerStyle, display: "grid", placeItems: "center", fontSize: 12, opacity: 0.6 }}>
          Spline preview (static)
        </div>
      </div>
    )
  }

  return (
    <div ref={outerRef} className={className} style={wrapperStyle}>
      <div style={innerStyle}>
        <React.Suspense fallback={<div style={{ padding: 12 }}>Loading 3D…</div>}>
          {error ? (
            <div style={{ padding: 12, fontSize: 14, lineHeight: 1.4 }}>{fallbackMessage}<br />
              <code style={{ fontSize: 12 }}>{error}</code>
            </div>
          ) : inView && resolvedUrl ? (
            <Spline
              scene={resolvedUrl}
              renderOnDemand={renderOnDemand}
              onLoad={(app) => {
                try {
                  if (Number.isFinite(zoom) && zoom > 0) app.setZoom(zoom)
                } catch {/* ignore */}
              }}
              // Let Spline fill the locked box
              style={{ width: "100%", height: "100%" }}
            />
          ) : null}
        </React.Suspense>
      </div>
    </div>
  )
}

// ----- Framer Controls -----
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

  aspectPreset: {
    type: ControlType.Enum,
    title: "Aspect Ratio",
    options: ["16:9", "4:3", "3:2", "1:1", "9:16", "21:9", "Custom"],
    optionTitles: ["16:9", "4:3", "3:2", "1:1", "9:16", "21:9", "Custom"],
    defaultValue: "16:9",
  },
  aspectCustom: {
    type: ControlType.String,
    title: "Custom (w:h)",
    placeholder: "e.g. 1200:800 or 1.5",
    defaultValue: "16:9",
    hidden: (p) => p.aspectPreset !== "Custom",
  },

  renderOnDemand: { type: ControlType.Boolean, title: "Render On Demand", defaultValue: true },
  mountWhenInView: { type: ControlType.Boolean, title: "Mount In View", defaultValue: true },
  preflightCheck: { type: ControlType.Boolean, title: "Check URL (HEAD)", defaultValue: true },

  zoom: {
    type: ControlType.Number,
    title: "Zoom",
    min: 0.1, max: 5, step: 0.1, displayStepper: true,
    defaultValue: 1,
  },
  fallbackMessage: {
    type: ControlType.String,
    title: "Fallback Message",
    defaultValue: "Spline scene URL failed to load (404/blocked). Check the path or host.",
  },
})

// Help Framer pick an initial size in Canvas (height auto-follows width after first layout)
;(SelfHostedSpline as any).defaultProps = {
  width: 1200,
  height: Math.round(1200 / (16 / 9)),
}