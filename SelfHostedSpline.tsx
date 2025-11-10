// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

// Ultra-early priming of the Spline viewer runtime
// Use jsDelivr (generally faster/more consistent globally than unpkg)
const VIEWER_MODULE_URL =
  "https://cdn.jsdelivr.net/npm/@splinetool/viewer/build/spline-viewer.js?module"

type WarmRecord = {
  controller: AbortController
  refs: number
  done: boolean
}

const MIN_RENDER_SIZE = 2
const ZERO_SIZE_REMOUNT_COOLDOWN_MS = 800

const warmedOrigins = new Set<string>()
const headLinkKeys = new Set<string>()
const warmFetchRegistry = new Map<string, WarmRecord>()
let viewerLoaderPromise: Promise<boolean> | null = null

const hasDOM = () => typeof window !== "undefined" && typeof document !== "undefined"

const ensureHead = () => {
  if (!hasDOM()) return false
  if (!document.head) {
    const head = document.createElement("head")
    document.documentElement?.prepend(head)
  }
  return !!document.head
}

function warmOriginOnce(origin: string) {
  if (!hasDOM() || warmedOrigins.has(origin)) return
  if (!ensureHead()) return
  warmedOrigins.add(origin)
  try {
    const dns = document.createElement("link")
    dns.rel = "dns-prefetch"
    dns.href = origin
    document.head!.appendChild(dns)

    const pre = document.createElement("link")
    pre.rel = "preconnect"
    pre.href = origin
    pre.crossOrigin = "anonymous"
    document.head!.appendChild(pre)
  } catch {}
}

function addHeadLinkOnce(key: string, builder: () => HTMLLinkElement | null) {
  if (!hasDOM() || headLinkKeys.has(key) || !ensureHead()) return
  try {
    const link = builder()
    if (link) {
      headLinkKeys.add(key)
      document.head!.appendChild(link)
    }
  } catch {}
}

function warmViewerRuntimeLinks() {
  if (!hasDOM()) return
  try {
    const origin = new URL(VIEWER_MODULE_URL).origin
    warmOriginOnce(origin)
  } catch {}

  addHeadLinkOnce(`modulepreload:${VIEWER_MODULE_URL}`, () => {
    const mp = document.createElement("link")
    mp.rel = "modulepreload"
    mp.href = VIEWER_MODULE_URL
    setAnonymousCrossOrigin(mp)
    mp.setAttribute("fetchpriority", "high")
    return mp
  })
}

function setAnonymousCrossOrigin(link: HTMLLinkElement) {
  link.crossOrigin = "anonymous"
  link.setAttribute("crossorigin", "anonymous")
  return link
}

warmViewerRuntimeLinks()

if (hasDOM()) {
  // Kick off the viewer import as soon as the module is evaluated.
  ensureSplineViewer().catch(() => {})
}

function warmFetchOnce(href: string, init?: RequestInit): () => void {
  if (!hasDOM() || typeof fetch !== "function" || !href) return () => {}
  let record = warmFetchRegistry.get(href)
  if (record) {
    record.refs += 1
    return () => releaseWarmFetch(href, record!)
  }

  const controller = new AbortController()
  record = { controller, refs: 1, done: false }
  warmFetchRegistry.set(href, record)
  const baseInit: RequestInit = {
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
    ...init,
    signal: controller.signal,
  }

  fetch(href, baseInit)
    .catch(() => {})
    .finally(() => {
      record!.done = true
      if (warmFetchRegistry.get(href) === record) {
        warmFetchRegistry.delete(href)
      }
    })

  return () => releaseWarmFetch(href, record!)
}

function releaseWarmFetch(href: string, record: WarmRecord) {
  if (record.done) return
  record.refs = Math.max(0, record.refs - 1)
  if (record.refs <= 0) {
    try {
      record.controller.abort()
    } catch {}
    if (warmFetchRegistry.get(href) === record) {
      warmFetchRegistry.delete(href)
    }
  }
}

function warmSceneAssets(sceneUrl: string): () => void {
  if (!hasDOM()) return () => {}
  const cleanup: Array<() => void> = []

  try {
    const sceneUrlObj = new URL(sceneUrl)
    warmOriginOnce(sceneUrlObj.origin)

    const processJsUrl = new URL("./process.js", sceneUrlObj).href
    const processWasmUrl = new URL("./process.wasm", sceneUrlObj).href

    addHeadLinkOnce(`prefetch:${sceneUrlObj.href}`, () => {
      const link = document.createElement("link")
      link.rel = "prefetch"
      link.as = "fetch"
      link.href = sceneUrlObj.href
      setAnonymousCrossOrigin(link)
      return link
    })

    cleanup.push(warmFetchOnce(sceneUrlObj.href))
    cleanup.push(warmFetchOnce(processJsUrl))
    cleanup.push(warmFetchOnce(processWasmUrl))
  } catch {}

  return () => {
    cleanup.forEach((fn) => {
      try {
        fn()
      } catch {}
    })
  }
}

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
  if (!hasDOM()) return false

  const isReady = () => (window as any).__splineViewerLoaded || customElements.get("spline-viewer")
  if (isReady()) return true
  if (viewerLoaderPromise) return viewerLoaderPromise

  viewerLoaderPromise = (async () => {
    warmViewerRuntimeLinks()

    const existing = document.querySelector("script[data-spline-viewer]") as HTMLScriptElement | null
    if (existing) {
      if ((existing as any)._loaded) {
        ;(window as any).__splineViewerLoaded = true
        return true
      }
      return await new Promise<boolean>((resolve) => {
        existing.addEventListener(
          "load",
          () => {
            ;(existing as any)._loaded = true
            ;(window as any).__splineViewerLoaded = true
            resolve(true)
          },
          { once: true }
        )
        existing.addEventListener("error", () => resolve(false), { once: true })
      })
    }

    try {
      await import(/* @vite-ignore */ VIEWER_MODULE_URL)
      await customElements.whenDefined("spline-viewer")
      ;(window as any).__splineViewerLoaded = true
      return true
    } catch (err) {
      console.debug("[SelfHostedSpline] dynamic import failed, falling back to script tag", err)
    }

    try {
      const script = document.createElement("script")
      script.type = "module"
      script.src = VIEWER_MODULE_URL.replace("?module", "")
      script.setAttribute("data-spline-viewer", "true")
      script.crossOrigin = "anonymous"
      return await new Promise<boolean>((resolve) => {
        script.addEventListener("load", () => {
          ;(script as any)._loaded = true
          ;(window as any).__splineViewerLoaded = true
          resolve(true)
        })
        script.addEventListener("error", () => resolve(false))
        document.head?.appendChild(script)
      })
    } catch (err) {
      console.debug("[SelfHostedSpline] script tag injection failed", err)
      return false
    }
  })()

  try {
    return await viewerLoaderPromise
  } finally {
    viewerLoaderPromise = null
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
  const [bounds, setBounds] = React.useState({ width: 0, height: 0 })
  const hasRenderableSize = bounds.width >= MIN_RENDER_SIZE && bounds.height >= MIN_RENDER_SIZE
  const remountBlockedUntil = React.useRef(0)
  const remountUnblockTimer = React.useRef<number | null>(null)
  const [remountTick, bumpRemountTick] = React.useReducer((v) => v + 1, 0)

  const nowMs = React.useCallback(() => {
    try {
      return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now()
    } catch {
      return Date.now()
    }
  }, [])

  const scheduleRemountCheck = React.useCallback(
    (delayMs: number) => {
      if (typeof window === "undefined") return
      if (remountUnblockTimer.current !== null) {
        window.clearTimeout(remountUnblockTimer.current)
      }
      remountUnblockTimer.current = window.setTimeout(() => {
        remountUnblockTimer.current = null
        bumpRemountTick()
      }, delayMs)
    },
    [bumpRemountTick]
  )

  const blockViewerMounts = React.useCallback(
    (ms: number) => {
      remountBlockedUntil.current = Math.max(remountBlockedUntil.current, nowMs() + ms)
      scheduleRemountCheck(ms + 5)
    },
    [nowMs, scheduleRemountCheck]
  )

  const tearDownViewer = React.useCallback(() => {
    const current = viewerElRef.current as (HTMLElement & { dispose?: () => void }) | null
    if (!current) return
    try {
      current.dispose?.()
    } catch {}
    try {
      current.remove()
    } catch {}
    viewerElRef.current = null
  }, [])

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


  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && remountUnblockTimer.current !== null) {
        window.clearTimeout(remountUnblockTimer.current)
        remountUnblockTimer.current = null
      }
    }
  }, [])

  // Preconnect + prefetch the scene payload and helper runtime assets.
  React.useEffect(() => {
    const cleanup: Array<() => void> = []
    cleanup.push(warmSceneAssets(gitHubUrl))

    let cancelled = false
    ;(async () => {
      const ok = await ensureSplineViewer()
      if (!cancelled) {
        setViewerReady(ok)
      }
    })()

    return () => {
      cancelled = true
      cleanup.forEach((fn) => {
        try {
          fn()
        } catch {}
      })
    }
  }, [gitHubUrl])

  // Observe the container box; skip WebGL init when width/height are zero
  React.useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      const nextWidth = Math.round(rect.width)
      const nextHeight = Math.round(rect.height)
      setBounds((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev
        return { width: nextWidth, height: nextHeight }
      })
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

    if (!mounted || !viewerReady || !hasRenderableSize) return
    if (nowMs() < remountBlockedUntil.current) return

    if (viewerElRef.current) return

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
        tearDownViewer()
      },
      { passive: false }
    )

    host.appendChild(el)
    viewerElRef.current = el
  }, [mounted, viewerReady, hasRenderableSize, gitHubUrl, tearDownViewer, nowMs, remountTick])

  // If the host collapses to ~0px, immediately dispose the WebGL context and delay remounts.
  React.useEffect(() => {
    if (hasRenderableSize) return
    if (!viewerElRef.current) return
    tearDownViewer()
    blockViewerMounts(ZERO_SIZE_REMOUNT_COOLDOWN_MS)
  }, [hasRenderableSize, tearDownViewer, blockViewerMounts])

  React.useEffect(() => {
    return () => {
      tearDownViewer()
    }
  }, [tearDownViewer])

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
      data-debug={`isStatic:${isStatic} mounted:${mounted} ready:${viewerReady} size:${bounds.width}x${bounds.height}`}
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
