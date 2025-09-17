// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

const Spline = React.lazy(() => import("@splinetool/react-spline"))

type Breakpoint = "mobile" | "tablet" | "desktop"

type Props = {
  gitHubBaseUrl: string
  mobileFileName: string
  tabletFileName: string
  desktopFileName: string
  splineProdUrl?: string

  /** aspect ratios are width / height (e.g. 16/9 = 1.777...) */
  ratioMobile: number
  ratioTablet: number
  ratioDesktop: number
  tabletMin: number
  desktopMin: number

  renderOnDemand: boolean
  mountWhenInView: boolean
  preflightCheck: boolean
  zoom: number
  fallbackMessage: string
  className?: string
}

export default function SelfHostedSpline({
  gitHubBaseUrl = "https://mojavestudio.github.io/mojave_ufo/",
  mobileFileName = "scene-mobile.splinecode",
  tabletFileName = "scene-tablet.splinecode",
  desktopFileName = "scene-desktop.splinecode",
  splineProdUrl = "",

  ratioMobile = 9 / 16,
  ratioTablet = 3 / 4,
  ratioDesktop = 16 / 9,
  tabletMin = 641,
  desktopMin = 1025,

  renderOnDemand = true,
  mountWhenInView = true,
  preflightCheck = true,
  zoom = 1,
  fallbackMessage = "Spline scene failed to load.",
  className,
}: Props) {
  const isStatic = useIsStaticRenderer()
  const hostRef = React.useRef<HTMLDivElement | null>(null)

  // measure component width (not viewport)
  const [width, setWidth] = React.useState(0)
  const [measuredOnce, setMeasuredOnce] = React.useState(false)
  React.useLayoutEffect(() => {
    if (!hostRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = Math.max(0, entries[0].contentRect.width)
      setWidth(w)
      if (!measuredOnce && w > 0) setMeasuredOnce(true)
    })
    ro.observe(hostRef.current)
    return () => ro.disconnect()
  }, [measuredOnce])

  // breakpoints from component width
  const bp: Breakpoint = width >= desktopMin ? "desktop" : width >= tabletMin ? "tablet" : "mobile"
  const ratio = bp === "desktop" ? ratioDesktop : bp === "tablet" ? ratioTablet : ratioMobile
  const height = width > 0 && ratio > 0 ? Math.round(width / ratio) : 0

  const sceneFile =
    bp === "desktop" ? desktopFileName : bp === "tablet" ? tabletFileName : mobileFileName

  const ghUrl = React.useMemo(() => {
    const base = (gitHubBaseUrl || "").replace(/\/+$/, "") + "/"
    return base + (sceneFile || "").replace(/^\/+/, "")
  }, [gitHubBaseUrl, sceneFile])

  // preflight choose GH → prod
  const [resolvedUrl, setResolvedUrl] = React.useState("")
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    let cancelled = false
    setError("")
    setResolvedUrl("")
    const ok = async (url: string) => {
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

  // mount gating (avoid overlapping WebGL)
  const [inView, setInView] = React.useState<boolean>(!mountWhenInView)
  React.useEffect(() => {
    if (!mountWhenInView || !hostRef.current) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      root: null,
      rootMargin: "200px 0px",
      threshold: 0.01,
    })
    io.observe(hostRef.current)
    return () => io.disconnect()
  }, [mountWhenInView])

  // apply the computed height to the component root so it self-sizes in Framer
  React.useLayoutEffect(() => {
    if (!hostRef.current) return
    if (height > 0) {
      hostRef.current.style.height = `${height}px`           // <- critical line
    }
  }, [height])

  // static/canvas: just show a reserved box with the ratio
  if (isStatic) {
    return (
      <div
        ref={hostRef}
        className={className}
        style={{ width: "100%", aspectRatio: ratio > 0 ? ratio : 16 / 9 }}
      />
    )
  }

  const shouldMountSpline = inView && measuredOnce && resolvedUrl && height > 0

  return (
    <div
      ref={hostRef}
      className={className}
      // width: 100% + aspectRatio ensures immediate space reservation;
      // height px is also set by the layoutEffect to override any Framer fixed height.
      style={{
        width: "100%",
        aspectRatio: ratio > 0 ? ratio : undefined,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <React.Suspense fallback={<div style={{ padding: 12 }}>Loading 3D…</div>}>
        {error ? (
          <div style={{ padding: 12, fontSize: 14, lineHeight: 1.4 }}>
            {fallbackMessage}
            <br />
            <code style={{ fontSize: 12 }}>{error}</code>
          </div>
        ) : shouldMountSpline ? (
          <Spline
            scene={resolvedUrl}
            renderOnDemand={renderOnDemand}
            onLoad={(app) => {
              try {
                if (Number.isFinite(zoom) && zoom > 0) app.setZoom(zoom)
              } catch {}
            }}
          />
        ) : null}
      </React.Suspense>
    </div>
  )
}

addPropertyControls(SelfHostedSpline, {
  gitHubBaseUrl: {
    type: ControlType.String,
    title: "GitHub Base",
    defaultValue: "https://mojavestudio.github.io/mojave_ufo/",
  },
  mobileFileName: { type: ControlType.String, title: "Mobile File", defaultValue: "scene-mobile.splinecode" },
  tabletFileName: { type: ControlType.String, title: "Tablet File", defaultValue: "scene-tablet.splinecode" },
  desktopFileName: { type: ControlType.String, title: "Desktop File", defaultValue: "scene-desktop.splinecode" },
  splineProdUrl: { type: ControlType.String, title: "Prod Fallback", placeholder: "https://prod.spline.design/.../scene.splinecode" },

  ratioMobile: { type: ControlType.Number, title: "Ratio Mobile", defaultValue: 9 / 16, step: 0.01, min: 0.2, max: 5, displayStepper: true },
  ratioTablet: { type: ControlType.Number, title: "Ratio Tablet", defaultValue: 3 / 4, step: 0.01, min: 0.2, max: 5, displayStepper: true },
  ratioDesktop: { type: ControlType.Number, title: "Ratio Desktop", defaultValue: 16 / 9, step: 0.01, min: 0.2, max: 5, displayStepper: true },
  tabletMin: { type: ControlType.Number, title: "Tablet ≥", defaultValue: 641, step: 1, displayStepper: true },
  desktopMin: { type: ControlType.Number, title: "Desktop ≥", defaultValue: 1025, step: 1, displayStepper: true },

  renderOnDemand: { type: ControlType.Boolean, title: "Render On Demand", defaultValue: true },
  mountWhenInView: { type: ControlType.Boolean, title: "Mount In View", defaultValue: true },
  preflightCheck: { type: ControlType.Boolean, title: "Check URL (HEAD)", defaultValue: true },
  zoom: { type: ControlType.Number, title: "Zoom", min: 0.1, max: 5, step: 0.1, displayStepper: true, defaultValue: 1 },
  fallbackMessage: { type: ControlType.String, title: "Fallback Message", defaultValue: "Spline scene failed to load." },
})