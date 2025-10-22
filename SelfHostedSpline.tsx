// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

// Ultra-early priming of the Spline viewer runtime
// Use jsDelivr (generally faster/more consistent globally than unpkg)
const VIEWER_MODULE_URL =
  "https://cdn.jsdelivr.net/npm/@splinetool/viewer/build/spline-viewer.js?module"

;(() => {
  if (typeof document === "undefined") return
  try {
    const origin = new URL(VIEWER_MODULE_URL).origin

    // DNS + TCP/TLS warmups for the runtime
    const dns = document.createElement("link")
    dns.rel = "dns-prefetch"
    dns.href = origin
    document.head.appendChild(dns)

    const pre = document.createElement("link")
    pre.rel = "preconnect"
    pre.href = origin
    pre.crossOrigin = "anonymous"
    document.head.appendChild(pre)

    // Modulepreload ensures dynamic import has no extra RTT
    const mp = document.createElement("link")
    mp.rel = "modulepreload"
    mp.href = VIEWER_MODULE_URL
    // non-standard but supported in Chromium; harmless elsewhere
    mp.setAttribute("fetchpriority", "high")
    document.head.appendChild(mp)
  } catch {}
})

// ---------------------------
// Types
// ---------------------------

type Props = {
  gitHubUrl: string
  style?: React.CSSProperties
  className?: string
  [key: string]: any
}

// ---------------------------
// Spline loader (singleton)
// ---------------------------

// Ensure the Spline <spline-viewer> web component is registered in this document.
async function ensureSplineViewer(): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") return false

  // If already defined, we're done
  if ((window as any).__splineViewerLoaded || customElements.get("spline-viewer")) {
    return true
  }

  // Preconnect/modulepreload to speed first byte for the viewer runtime
  try {
    const origin = new URL(VIEWER_MODULE_URL).origin

    const dns = document.createElement("link")
    dns.rel = "dns-prefetch"
    dns.href = origin
    document.head.appendChild(dns)

    const pre = document.createElement("link")
    pre.rel = "preconnect"
    pre.href = origin
    pre.crossOrigin = "anonymous"
    document.head.appendChild(pre)

    const mp = document.createElement("link")
    mp.rel = "modulepreload"
    mp.href = VIEWER_MODULE_URL
    mp.setAttribute("fetchpriority", "high")
    document.head.appendChild(mp)
  } catch {}

  // Strategy A: dynamic import (preferred inside module environments)
  try {
    await import(/* @vite-ignore */ VIEWER_MODULE_URL)
    ;(window as any).__splineViewerLoaded = true
    return true
  } catch (err) {
    console.debug("[SelfHostedSpline] dynamic import failed, falling back to script tag", err)
  }

  // Strategy B: script tag injection fallback
  try {
    const existing = document.querySelector("script[data-spline-viewer]") as HTMLScriptElement | null
    if (existing) {
      if ((existing as any)._loaded) return true
      return await new Promise<boolean>((resolve) => {
        existing.addEventListener("load", () => resolve(true), { once: true })
        existing.addEventListener("error", () => resolve(false), { once: true })
      })
    }

    const script = document.createElement("script")
    script.type = "module"
    script.src = VIEWER_MODULE_URL.replace("?module", "")
    script.setAttribute("data-spline-viewer", "true")
    const result = await new Promise<boolean>((resolve) => {
      script.addEventListener("load", () => {
        ;(script as any)._loaded = true
        ;(window as any).__splineViewerLoaded = true
        resolve(true)
      })
      script.addEventListener("error", () => resolve(false))
      document.head.appendChild(script)
    })
    return result
  } catch (err) {
    console.debug("[SelfHostedSpline] script tag injection failed", err)
    return false
  }
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 960
 * @framerIntrinsicHeight 100
 */
export default function SelfHostedSpline(props: Props) {
  const { gitHubUrl, style, className, ...rest } = props

  // NOTE: Framer's useIsStaticRenderer() sometimes returns true in preview sandboxes.
  // Do not gate rendering on isStatic; it's only useful for debug.
  const isStatic = useIsStaticRenderer()

  // Refs
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const viewerElRef = React.useRef<HTMLElement | null>(null)

  // State
  const [mounted, setMounted] = React.useState(false)
  const [viewerReady, setViewerReady] = React.useState(false)
  const [hasWidth, setHasWidth] = React.useState(false)

  // Merge incoming style, guarantee intrinsic height via CSS aspect-ratio.
  const mergedStyle: React.CSSProperties = {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    // Fill the layer height (Framer controls the outer frame height).
    height: "100%",
    flexShrink: 0,
    minHeight: 0,
    ...(style || {}),
  }


  // Preconnect to the scene origin (avoid preload to prevent console warning).
  React.useEffect(() => {
    setMounted(true)
    let cleanup: Array<() => void> = []
    try {
      const u = new URL(gitHubUrl)
      // DNS-prefetch helps in some browsers
      const dns = document.createElement("link")
      dns.rel = "dns-prefetch"
      dns.href = u.origin
      document.head.appendChild(dns)
      cleanup.push(() => dns.remove())

      const preconnect = document.createElement("link")
      preconnect.rel = "preconnect"
      preconnect.href = u.origin
      preconnect.crossOrigin = "anonymous"
      document.head.appendChild(preconnect)
      cleanup.push(() => preconnect.remove())

      // Aggressively warm the scene payload into HTTP cache
      // Using fetch avoids preload warnings and still makes the viewer's request an instant hit.
      const ctrl = new AbortController()
      fetch(gitHubUrl, {
        mode: "cors",
        credentials: "omit",
        cache: "force-cache",
        signal: ctrl.signal,
      }).catch(() => {})
      cleanup.push(() => ctrl.abort())
    } catch {}

    ;(async () => {
      const ok = await ensureSplineViewer()
      setViewerReady(ok)
      console.debug("[SelfHostedSpline] viewerReady =", ok)
    })()

    return () => {
      cleanup.forEach((fn) => {
        try {
          fn()
        } catch {}
      })
    }
  }, [gitHubUrl])

  // Observe container width; avoid initializing WebGL when width is 0
  React.useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setHasWidth(rect.width > 0)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener("orientationchange", update)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("orientationchange", update)
      window.removeEventListener("resize", update)
    }
  }, [])

  // Create the <spline-viewer> element once when ready & measurable
  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Helper to destroy viewer and free GPU context
    const destroyViewer = () => {
      const el = viewerElRef.current as any
      if (el) {
        try {
          el.dispose?.()
        } catch {}
        try {
          el.remove()
        } catch {}
        viewerElRef.current = null
      }
    }

    if (mounted && viewerReady && hasWidth && !viewerElRef.current) {
      const el = document.createElement("spline-viewer") as HTMLElement & { dispose?: () => void }
      el.setAttribute("url", gitHubUrl)
      el.setAttribute("loading", "eager")
      Object.assign(el.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" })

      // Handle WebGL context loss gracefully
      // @ts-ignore - event type is not in TS lib for generic HTMLElement
      el.addEventListener(
        "webglcontextlost",
        (e: Event) => {
          // @ts-ignore
          if (typeof (e as any).preventDefault === "function") (e as any).preventDefault()
          console.warn("[SelfHostedSpline] webglcontextlost — tearing down viewer to avoid error spam")
          destroyViewer()
        },
        { passive: false }
      )

      host.appendChild(el)
      viewerElRef.current = el

      return () => {}
    }

  }, [mounted, viewerReady, hasWidth, gitHubUrl])

  React.useEffect(() => {
    return () => {
      try {
        const el = viewerElRef.current as any
        if (el) el.dispose?.()
      } catch {}
      try {
        const el = viewerElRef.current
        if (el) el.remove()
      } catch {}
    }
  }, [])

  // If the URL changes and a viewer exists, update it without remount
  React.useEffect(() => {
    const el = viewerElRef.current
    if (el && el.getAttribute("url") !== gitHubUrl) {
      el.setAttribute("url", gitHubUrl)
    }
  }, [gitHubUrl])

  return (
    <div
      ref={containerRef}
      className={className}
      data-debug={`isStatic:${isStatic} mounted:${mounted} ready:${viewerReady} width:${hasWidth}`}
      style={mergedStyle}
      {...rest}
    >
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      {/* No overlay/placeholder; let the canvas own the paint to avoid flicker */}
    </div>
  )
}

addPropertyControls(SelfHostedSpline, {
  gitHubUrl: {
    type: ControlType.String,
    title: "Scene URL",
    defaultValue: "https://mojavestudio.github.io/mojave_ufo/scene.splinecode",
  }
})