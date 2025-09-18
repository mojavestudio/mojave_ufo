// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

const Spline = React.lazy(() => import("@splinetool/react-spline"))

type Props = {
  width?: number
  height?: number
  gitHubBaseUrl: string
  sceneFileName: string
  splineProdUrl?: string
  fallbackAspectRatio: number
  renderOnDemand: boolean
  mountWhenInView: boolean
  preflightCheck: boolean
  zoom: number
  fallbackMessage: string
  className?: string
}

export default function SelfHostedSpline({
  width: layoutWidth,
  height: layoutHeight,
  gitHubBaseUrl = "https://mojavestudio.github.io/mojave_ufo/",
  sceneFileName = "scene.splinecode",
  splineProdUrl = "",
  fallbackAspectRatio = 16 / 9,
  renderOnDemand = true,
  mountWhenInView = true,
  preflightCheck = true,
  zoom = 1,
  fallbackMessage = "Spline scene failed to load.",
  className,
}: Props) {
  const isStatic = useIsStaticRenderer()
  const hostRef = React.useRef<HTMLDivElement | null>(null)

  const explicitHeight =
    typeof layoutHeight === "number" && Number.isFinite(layoutHeight) && layoutHeight > 0
      ? layoutHeight
      : undefined
  const explicitWidth =
    typeof layoutWidth === "number" && Number.isFinite(layoutWidth) && layoutWidth > 0
      ? layoutWidth
      : undefined

  const ghUrl = React.useMemo(() => {
    const base = (gitHubBaseUrl || "").replace(/\/+$/, "") + "/"
    return base + (sceneFileName || "").replace(/^\/+/, "")
  }, [gitHubBaseUrl, sceneFileName])

  // preflight choose GH → prod
  const [resolvedUrl, setResolvedUrl] = React.useState("")
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    let cancelled = false
    setError("")
    setResolvedUrl("")
    const ok = async (url: string) => {
      try { const h = await fetch(url, { method: "HEAD", cache: "no-store" }); if (h.ok) return true } catch {}
      try { const g = await fetch(url, { method: "GET", cache: "no-store" }); return g.ok } catch { return false }
    }
    ;(async () => {
      if (!preflightCheck) { setResolvedUrl(ghUrl || splineProdUrl || ""); return }
      if (ghUrl && (await ok(ghUrl))) { if (!cancelled) setResolvedUrl(ghUrl); return }
      if (splineProdUrl && (await ok(splineProdUrl))) { if (!cancelled) setResolvedUrl(splineProdUrl); return }
      if (!cancelled) { setResolvedUrl(ghUrl || splineProdUrl || ""); setError(`Could not load: ${ghUrl || splineProdUrl || "(no url)"}`) }
    })()
    return () => { cancelled = true }
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

  const shouldMountSpline = inView && !!resolvedUrl && !error

  const hostStyle: React.CSSProperties = {
    width: explicitWidth ?? "100%",
    height: explicitHeight ?? undefined,
    aspectRatio: explicitHeight == null && fallbackAspectRatio > 0 ? `${fallbackAspectRatio}` : undefined,
    position: "relative",
    overflow: "hidden",
    contain: "layout style paint",
  }

  // static/canvas: reserve space via aspect-ratio to avoid 0→N jump
  if (isStatic) {
    return (
      <div
        ref={hostRef}
        className={className}
        style={hostStyle}
      />
    )
  }

  return (
    <div
      ref={hostRef}
      className={className}
      style={hostStyle}
    >
      {shouldMountSpline ? (
        <React.Suspense fallback={<div style={{ padding: 12 }}>Loading 3D…</div>}>
          <Spline
            scene={resolvedUrl}
            renderOnDemand={renderOnDemand}
            style={{ width: "100%", height: "100%", display: "block", position: "absolute", inset: 0 }}
            onLoad={(app) => {
              try { if (Number.isFinite(zoom) && zoom > 0) app.setZoom(zoom) } catch {}
            }}
          />
        </React.Suspense>
      ) : null}
      {!shouldMountSpline && !error ? <div style={{ position: "absolute", inset: 0 }} /> : null}
      {error ? (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 12 }}>
          <span>{fallbackMessage}</span>
        </div>
      ) : null}
    </div>
  )
}

addPropertyControls(SelfHostedSpline, {
  gitHubBaseUrl: { type: ControlType.String, title: "GitHub Base", defaultValue: "https://mojavestudio.github.io/mojave_ufo/" },
  sceneFileName: { type: ControlType.String, title: "Scene File", defaultValue: "scene.splinecode" },
  fallbackAspectRatio: { type: ControlType.Number, title: "Fallback Ratio", defaultValue: 16 / 9, step: 0.01, min: 0.2, max: 5, displayStepper: true },
  renderOnDemand: { type: ControlType.Boolean, title: "Render On Demand", defaultValue: true },
  mountWhenInView: { type: ControlType.Boolean, title: "Mount In View", defaultValue: true },
  preflightCheck: { type: ControlType.Boolean, title: "Check URL (HEAD)", defaultValue: true },
  zoom: { type: ControlType.Number, title: "Zoom", min: 0.1, max: 5, step: 0.1, displayStepper: true, defaultValue: 1 },
  fallbackMessage: { type: ControlType.String, title: "Fallback Message", defaultValue: "Spline scene failed to load." },
})
