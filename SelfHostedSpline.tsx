// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import type { Application } from "@splinetool/runtime"

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
  const appRef = React.useRef<Application | null>(null)
  const removeRenderedListenerRef = React.useRef<(() => void) | null>(null)

  // Track live box size so we only mount the WebGL once we have real pixels
  const [contentSize, setContentSize] = React.useState({ width: 0, height: 0 })
  const [resetSignal, setResetSignal] = React.useState(0)
  React.useLayoutEffect(() => {
    if (!hostRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      const nextWidth = Math.max(0, width)
      const nextHeight = Math.max(0, height)
      setContentSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev
        const next = { width: nextWidth, height: nextHeight }
        setResetSignal((token) => token + 1)
        return next
      })
    })
    ro.observe(hostRef.current)
    return () => ro.disconnect()
  }, [])

  const explicitHeight =
    typeof layoutHeight === "number" && Number.isFinite(layoutHeight) && layoutHeight > 0
      ? layoutHeight
      : undefined
  const explicitWidth =
    typeof layoutWidth === "number" && Number.isFinite(layoutWidth) && layoutWidth > 0
      ? layoutWidth
      : undefined

  const measuredWidth = contentSize.width
  const autoHeightCandidate =
    explicitHeight == null && fallbackAspectRatio > 0 && measuredWidth > 0
      ? Math.max(1, Math.round(measuredWidth / fallbackAspectRatio))
      : undefined

  const [frozenAutoHeight, setFrozenAutoHeight] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (explicitHeight != null) {
      if (frozenAutoHeight !== null) setFrozenAutoHeight(null)
      return
    }
    if (autoHeightCandidate != null && autoHeightCandidate !== frozenAutoHeight) {
      setFrozenAutoHeight(autoHeightCandidate)
    }
  }, [explicitHeight, autoHeightCandidate, frozenAutoHeight])

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

  const widthForLayout = explicitWidth ?? measuredWidth
  const heightForLayout = explicitHeight ?? frozenAutoHeight ?? null
  const hasArea = (widthForLayout ?? 0) > 0 && (heightForLayout ?? 0) > 0
  const shouldMountSpline = inView && !!resolvedUrl && !error && hasArea

  React.useEffect(() => {
    return () => {
      try { removeRenderedListenerRef.current?.() } catch {}
      removeRenderedListenerRef.current = null
      try { appRef.current?.dispose?.() } catch {}
      appRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (!shouldMountSpline) {
      try { removeRenderedListenerRef.current?.() } catch {}
      removeRenderedListenerRef.current = null
      try { appRef.current?.dispose?.() } catch {}
      appRef.current = null
    }
  }, [shouldMountSpline])

  const hostStyle: React.CSSProperties = {
    width: explicitWidth ?? "100%",
    height: explicitHeight ?? frozenAutoHeight ?? undefined,
    aspectRatio:
      explicitHeight == null && frozenAutoHeight == null && fallbackAspectRatio > 0
        ? `${fallbackAspectRatio}`
        : undefined,
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
        <ManagedSpline
          scene={resolvedUrl}
          renderOnDemand={renderOnDemand}
          zoom={zoom}
          onApp={(app, cleanup) => {
            appRef.current = app
            removeRenderedListenerRef.current = cleanup
          }}
          showFallback={!error}
          resetSignal={resetSignal}
        />
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

type ManagedSplineProps = {
  scene: string
  renderOnDemand: boolean
  zoom: number
  onApp: (app: Application, cleanup: () => void) => void
  showFallback: boolean
  resetSignal: number
}

const zeroVariableCandidates = ["scroll", "progress", "timeline"]

function ManagedSpline({ scene, renderOnDemand, zoom, onApp, showFallback, resetSignal }: ManagedSplineProps) {
  const [visible, setVisible] = React.useState(false)
  const hideUntilRendered = React.useCallback(() => setVisible(false), [])
  const cleanupRef = React.useRef<(() => void) | null>(null)
  const appInstanceRef = React.useRef<Application | null>(null)

  const resetState = React.useCallback((app: Application) => {
    if (!app) return

    const run = () => {
      try {
        const vars = typeof app.getVariables === "function" ? app.getVariables() : null
        if (vars) {
          Object.entries(vars).forEach(([key, value]) => {
            if (typeof value !== "number" || !Number.isFinite(value)) return
            const keyLc = key.toLowerCase()
            if (zeroVariableCandidates.some((pattern) => keyLc.includes(pattern))) {
              try { app.setVariable(key, 0) } catch {}
            }
          })
        }
      } catch {}

      try {
        const objects = typeof app.getAllObjects === "function" ? app.getAllObjects() : []
        objects.forEach((obj) => {
          if (!obj || typeof obj !== "object") return
          if (!("state" in obj)) return
          try {
            obj.state = null
            obj.state = undefined
          } catch {}
        })
      } catch {}

      try {
        const events = typeof app.getSplineEvents === "function" ? app.getSplineEvents() : null
        const scrollEvents = events && (events.scroll || events.Scroll)
        if (scrollEvents && typeof app.emitEventReverse === "function") {
          Object.keys(scrollEvents).forEach((id) => {
            try { app.emitEventReverse("scroll", id) } catch {}
          })
        }
      } catch {}
    }

    run()
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        try { run() } catch {}
      })
    }
  }, [])

  // Reset visibility when scene changes so we wait for the emitted render event again
  React.useEffect(() => {
    hideUntilRendered()
  }, [scene, hideUntilRendered])

  React.useEffect(() => {
    return () => {
      try { cleanupRef.current?.() } catch {}
      cleanupRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (appInstanceRef.current) {
      resetState(appInstanceRef.current)
    }
  }, [resetSignal, resetState])

  return (
    <React.Suspense fallback={showFallback ? <div style={{ padding: 12 }}>Loading 3D…</div> : null}>
      <Spline
        scene={scene}
        renderOnDemand={renderOnDemand}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          position: "absolute",
          inset: 0,
          opacity: visible ? 1 : 0,
          transition: "opacity 240ms ease-out",
          pointerEvents: visible ? "auto" : "none",
        }}
        onLoad={(app) => {
          hideUntilRendered()

          const handleRendered = () => {
            if (fallbackTimer != null && typeof window !== "undefined") {
              window.clearTimeout(fallbackTimer)
              fallbackTimer = null
            }
            requestAnimationFrame(() => {
              setVisible(true)
              resetState(app)
            })
          }

          let fallbackTimer: number | null = null
          const armFallback = () => {
            if (typeof window === "undefined") {
              return
            }
            fallbackTimer = window.setTimeout(() => {
              setVisible(true)
            }, 1200)
          }

          try {
            app.addEventListener("rendered", handleRendered)
            armFallback()
          } catch {
            // If this build doesn't expose the rendered event, fall back to showing immediately
            setVisible(true)
          }

          const cleanup = () => {
            try { app.removeEventListener("rendered", handleRendered) } catch {}
            if (fallbackTimer != null) {
              if (typeof window !== "undefined") window.clearTimeout(fallbackTimer)
              fallbackTimer = null
            }
          }

          try { if (Number.isFinite(zoom) && zoom > 0) app.setZoom(zoom) } catch {}
          resetState(app)
          appInstanceRef.current = app

          if (renderOnDemand) {
            const kick = () => {
              try { app.requestRender?.() } catch {}
            }
            kick()
            requestAnimationFrame(kick)
            setTimeout(kick, 32)
          }

          requestAnimationFrame(() => {
            try {
              if (typeof app.stop === "function") app.stop()
              if (typeof app.play === "function") app.play()
            } catch {}
          })

          cleanupRef.current = cleanup
          onApp(app, () => {
            cleanup()
            cleanupRef.current = null
            appInstanceRef.current = null
          })
        }}
      />
    </React.Suspense>
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