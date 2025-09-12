/** @framerIntrinsicWidth 1200 */
/** @framerIntrinsicHeight 700 */
/** @framerSupportedLayoutWidth any */
/** @framerSupportedLayoutHeight any */
/** @framerDisableUnlink */

import type * as React from "react"
import * as R from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

declare global {
    namespace JSX {
        interface IntrinsicElements {
            "spline-viewer": React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement>,
                HTMLElement
            > & {
                url?: string
                "events-target"?: "local" | "window"
                "loading-anim"?: string | boolean
            }
        }
    }
}

// keep module in TS
export {}

type Props = {
    repoUrl?: string
}

const INTRINSIC_W = 1200
const INTRINSIC_H = 700
const ASPECT = INTRINSIC_H / INTRINSIC_W
const VIEWER_VERSION = "1.10.57"

/* ---------- URL helpers ---------- */
function deriveSceneUrlFromRepo(repoUrl?: string): string | undefined {
    if (!repoUrl) return
    const t = repoUrl.trim()
    if (!t) return
    if (t.toLowerCase().endsWith(".splinecode")) return t
    if (t.startsWith("git@github.com:")) {
        const [o, r] = t
            .replace("git@github.com:", "")
            .replace(/\.git$/i, "")
            .split("/")
        return o && r
            ? `https://${o}.github.io/${r}/scene.splinecode`
            : undefined
    }
    try {
        const u = new URL(t)
        if (u.hostname === "github.com") {
            const [o, r] = u.pathname.replace(/^\/|\/$/g, "").split("/")
            return o && r
                ? `https://${o}.github.io/${r.replace(/\.git$/i, "")}/scene.splinecode`
                : undefined
        }
        if (u.hostname.endsWith("github.io")) {
            const seg = u.pathname
                .replace(/^\/|\/$/g, "")
                .split("/")
                .filter(Boolean)[0]
            return seg
                ? `${u.origin}/${seg}/scene.splinecode`
                : `${u.origin}/scene.splinecode`
        }
    } catch {}
    return
}

// Variant-aware scene url helper (prefers mobile/desktop filenames when available)
function deriveVariantSceneUrlFromRepo(repoUrl: string | undefined, opts: { mobile?: boolean } = {}): string | undefined {
    if (!repoUrl) return
    const t = repoUrl.trim()
    if (!t) return
    // If a direct .splinecode is provided, respect it regardless of variant
    if (t.toLowerCase().endsWith('.splinecode')) return t

    const filename = opts.mobile ? 'scene-mobile.splinecode' : 'scene-desktop.splinecode'

    if (t.startsWith('git@github.com:')) {
        const [o, r] = t.replace('git@github.com:', '').replace(/\.git$/i, '').split('/')
        return o && r ? `https://${o}.github.io/${r}/${filename}` : undefined
    }
    try {
        const u = new URL(t)
        if (u.hostname === 'github.com') {
            const [o, r] = u.pathname.replace(/^\/|\/$/g, '').split('/')
            return o && r ? `https://${o}.github.io/${r.replace(/\.git$/i, '')}/${filename}` : undefined
        }
        if (u.hostname.endsWith('github.io')) {
            const seg = u.pathname.replace(/^\/|\/$/g, '').split('/').filter(Boolean)[0]
            return seg ? `${u.origin}/${seg}/${filename}` : `${u.origin}/${filename}`
        }
    } catch {}
    return
}

function derivePosterUrlFromRepo(repoUrl?: string): string | undefined {
    if (!repoUrl) return
    const t = repoUrl.trim()
    if (!t) return
    if (t.toLowerCase().endsWith(".png") || t.toLowerCase().endsWith(".jpg") || t.toLowerCase().endsWith(".jpeg"))
        return t
    if (t.startsWith("git@github.com:")) {
        const [o, r] = t
            .replace("git@github.com:", "")
            .replace(/\.git$/i, "")
            .split("/")
        return o && r ? `https://${o}.github.io/${r}/poster.png` : undefined
    }
    try {
        const u = new URL(t)
        if (u.hostname === "github.com") {
            const [o, r] = u.pathname.replace(/^\/|\/$/g, "").split("/")
            return o && r ? `https://${o}.github.io/${r.replace(/\.git$/i, "")}/poster.png` : undefined
        }
        if (u.hostname.endsWith("github.io")) {
            const seg = u.pathname
                .replace(/^\/|\/$/g, "")
                .split("/")
                .filter(Boolean)[0]
            return seg ? `${u.origin}/${seg}/poster.png` : `${u.origin}/poster.png`
        }
    } catch {}
    return
}

/* ---------- Script & network hints (SSR-safe) ---------- */
function ensureSplineViewer(version = VIEWER_VERSION): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve()
    if (customElements.get("spline-viewer")) return Promise.resolve()
    const id = `spline-viewer@${version}`
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing)
        return customElements.whenDefined("spline-viewer").then(() => {})
    return new Promise<void>((resolve, reject) => {
        const s = document.createElement("script")
        s.id = id
        s.type = "module"
        s.src = `https://unpkg.com/@splinetool/viewer@${version}/build/spline-viewer.js`
        s.onload = () =>
            customElements
                .whenDefined("spline-viewer")
                .then(() => resolve(), reject)
        s.onerror = (e) => reject(e)
        document.head.appendChild(s)
    })
}

function hintNetwork(sceneUrl: string) {
    if (typeof window === "undefined") return
    try {
        const u = new URL(sceneUrl)
        const preId = `preconnect:${u.origin}`
        if (!document.getElementById(preId)) {
            const l = document.createElement("link")
            l.id = preId
            l.rel = "preconnect"
            l.href = u.origin
            l.crossOrigin = ""
            document.head.appendChild(l)
        }
        // Avoid cross-document preload; the scene loads inside an iframe srcdoc,
        // which would trigger "preloaded but not used" warning in the outer doc.
    } catch {}
}

/* ---------- Component ---------- */
function SelfHostedSpline({
    repoUrl = "https://github.com/mojavestudio/mojave_ufo",
}: Props) {
    const isCanvas = RenderTarget.current() === RenderTarget.canvas
    const containerRef = R.useRef<HTMLDivElement | null>(null)
    const viewerRef = R.useRef<HTMLElement | null>(null)

    // Measure parent size early (used by variant selection and snapshot effect)
    const [box, setBox] = R.useState<{ w: number; h: number }>({ w: 0, h: 0 })
    R.useLayoutEffect(() => {
        if (!containerRef.current) return
        const ro = new ResizeObserver((entries) => {
            for (const e of entries) {
                const { width, height } = e.contentRect || {}
                if (typeof width === "number" && typeof height === "number") {
                    setBox({
                        w: Math.max(1, Math.round(width)),
                        h: Math.max(1, Math.round(height)),
                    })
                }
            }
        })
        ro.observe(containerRef.current)
        return () => ro.disconnect()
    }, [])

    // Lock the variant at mount using width-only (prevents flip when mobile URL bar collapses)
    const [variant] = R.useState<'mobile' | 'desktop'>(() => {
        if (typeof window !== 'undefined' && 'matchMedia' in window) {
            try { return window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop' } catch {}
        }
        return 'desktop'
    })

    // Build scene URL from locked variant (no switching after load)
    const sceneUrl = R.useMemo(() => {
        const v = deriveVariantSceneUrlFromRepo(repoUrl, { mobile: variant === 'mobile' })
        return v ?? deriveSceneUrlFromRepo(repoUrl)
    }, [repoUrl, variant])
    const [autoPoster, setAutoPoster] = R.useState<string | undefined>(undefined)
    const derivedPoster = autoPoster

    // Prime connections to the scene host for faster loads
    R.useEffect(() => {
        if (sceneUrl) hintNetwork(sceneUrl)
    }, [sceneUrl])

    // Optionally silence Spline telemetry network calls (reduces CORS noise in Framer)
    R.useEffect(() => {
        const mute = isCanvas
        if (!mute || typeof window === 'undefined') return
        const hookHost = 'hooks.spline.design'
        const g = window as any
        const origFetch = g.fetch?.bind(g)
        if (origFetch) {
            try {
                g.fetch = (input: any, init?: any) => {
                    try {
                        const url = typeof input === 'string' ? input : input?.url
                        const u = new URL(url, window.location.href)
                        if (u.hostname === hookHost) return Promise.resolve(new Response('', { status: 204 }))
                    } catch {}
                    return origFetch(input, init)
                }
            } catch {}
        }
        const nav: any = navigator
        const origBeacon = nav.sendBeacon?.bind(nav)
        if (origBeacon) {
            try {
                nav.sendBeacon = (url: any, data?: any) => {
                    try { const u = new URL(url, window.location.href); if (u.hostname === hookHost) return true } catch {}
                    return origBeacon(url, data)
                }
            } catch {}
        }
        const XHROPEN = XMLHttpRequest.prototype.open
        const XHRSEND = XMLHttpRequest.prototype.send
        try {
            XMLHttpRequest.prototype.open = function(this: any, method: any, url: any, ...rest: any[]) {
                try { const u = new URL(url, window.location.href); if (u.hostname === hookHost) this.__skipSpline__ = true } catch {}
                return XHROPEN.call(this, method, url, ...rest)
            }
            XMLHttpRequest.prototype.send = function(this: any, body?: any) {
                if (this.__skipSpline__) { try { this.abort() } catch {} return }
                return XHRSEND.call(this, body)
            }
        } catch {}
        return () => {
            if (origFetch) g.fetch = origFetch
            if (origBeacon) nav.sendBeacon = origBeacon
            try { XMLHttpRequest.prototype.open = XHROPEN; XMLHttpRequest.prototype.send = XHRSEND } catch {}
        }
    }, [isCanvas])

    // Ensure the Spline web component is registered when rendering directly
    R.useEffect(() => {
        if (!sceneUrl) return
        ensureSplineViewer(VIEWER_VERSION).catch(() => {})
    }, [sceneUrl])

    // Silence a few noisy Canvas warnings coming from Framer-owned iframes
    R.useEffect(() => {
        if (!isCanvas || typeof window === 'undefined') return
        const origWarn = console.warn
        const origError = console.error
        const shouldDrop = (msg: any) => {
            try {
                const s = String(msg || '')
                return (
                    s.includes('ambient-light-sensor') ||
                    s.includes("Allow attribute will take precedence over 'allowfullscreen'") ||
                    s.includes('Vantara: Failed to initialize session')
                )
            } catch { return false }
        }
        console.warn = (...a: any[]) => { if (shouldDrop(a[0])) return; return origWarn.apply(console, a) }
        console.error = (...a: any[]) => { if (shouldDrop(a[0])) return; return origError.apply(console, a) }
        return () => { console.warn = origWarn; console.error = origError }
    }, [isCanvas])


    // Try to intelligently resolve a poster from the site with multiple fallbacks
    R.useEffect(() => {
        let cancelled = false
        async function probe(url: string): Promise<boolean> {
            return new Promise((resolve) => {
                const img = new Image()
                const done = (ok: boolean) => {
                    img.onload = null
                    img.onerror = null
                    resolve(ok)
                }
                img.onload = () => done((img.naturalWidth ?? 0) > 1 && (img.naturalHeight ?? 0) > 1)
                img.onerror = () => done(false)
                img.src = url
            })
        }
        async function resolvePoster() {
            const baseFromRepo = derivePosterUrlFromRepo(repoUrl) // poster.png preferred
            // Derive a base site origin for other common filenames
            let siteBase: string | undefined
            try {
                const t = repoUrl?.trim()
                if (!t) siteBase = undefined
                else if (t.startsWith("git@github.com:")) {
                    const [o, r] = t.replace("git@github.com:", "").replace(/\.git$/i, "").split("/")
                    if (o && r) siteBase = `https://${o}.github.io/${r}/`
                } else {
                    const u = new URL(t)
                    if (u.hostname === "github.com") {
                        const [o, r] = u.pathname.replace(/^\/|\/$/g, "").split("/")
                        if (o && r) siteBase = `https://${o}.github.io/${r.replace(/\.git$/i, "")}/`
                    } else if (u.hostname.endsWith("github.io")) {
                        const seg = u.pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean)[0]
                        siteBase = seg ? `${u.origin}/${seg}/` : `${u.origin}/`
                    }
                }
            } catch {}

            const candidates = [
                baseFromRepo,
                siteBase && siteBase + "poster.png",
                siteBase && siteBase + "poster.jpg",
                siteBase && siteBase + "og.png",
                siteBase && siteBase + "og.jpg",
                siteBase && siteBase + "social.png",
                siteBase && siteBase + "social.jpg",
                siteBase && siteBase + "cover.jpg",
                siteBase && siteBase + "cover.png",
                siteBase && siteBase + "screenshot.png",
                siteBase && siteBase + "banner.jpg",
                siteBase && siteBase + "banner.png",
            ].filter(Boolean) as string[]

            for (const url of candidates) {
                try {
                    const ok = await probe(url)
                    if (ok) { if (!cancelled) setAutoPoster(url); return }
                } catch {}
            }

            // Optional last resort: use a screenshot service (disabled by default)
            const useScreenshotFallback = false
            if (siteBase && useScreenshotFallback) {
                const targets = [
                    `https://v1.screenshot.11ty.dev/${encodeURIComponent(siteBase)}opengraph/`,
                    `https://v1.screenshot.11ty.dev/${encodeURIComponent(siteBase)}full.png`,
                ]
                for (const s of targets) {
                    try {
                        const ok = await probe(s)
                        if (ok) { if (!cancelled) setAutoPoster(s); return }
                    } catch {}
                }
            }
            if (!cancelled) setAutoPoster(undefined)
        }
        resolvePoster()
        return () => { cancelled = true }
    }, [repoUrl])

    // (moved earlier)

    // Poster visibility overlay
    const [ready, setReady] = R.useState(false)
    const hasSize = box.w > 1 && box.h > 1
    // Reset ready on URL change
    R.useEffect(() => { setReady(false) }, [sceneUrl])

    // Mark ready precisely after first frame at t=0 is rendered.
    // Also keep a conservative fallback so the poster never sticks indefinitely.
    R.useEffect(() => {
        const el = viewerRef.current as any
        if (!el) return
        let raf1 = 0
        let raf2 = 0
        let raf3 = 0
        let done = false
        let handled = false
        let playTimer: number | undefined
        let guardRaf: number = 0
        const isMobile = variant === 'mobile'
        const playDelay = isMobile ? 450 : 80
        const guardWindow = isMobile ? 600 : 120 // keep time frozen at 0 during this window
        const postPlayFreezeFrames = isMobile ? 12 : 2

        const revealSafely = () => {
            if (done) return
            done = true
            setReady(true)
        }

        const onLoadAny = () => {
            if (handled) return
            handled = true
            const startSequence = () => {
                // Freeze at t=0 immediately, then reveal after a couple RAFs and start playback.
                try { el.pause?.() } catch {}
                try { el.setTime?.(0) } catch {}
                try { (el as any).render?.() } catch {}
                // Guard: while we prepare to start, keep forcing t=0 so it cannot advance on slow devices
                const guardUntil = Date.now() + guardWindow
                const guard = () => {
                    if (Date.now() > guardUntil) { guardRaf = 0; return }
                    try { el.pause?.() } catch {}
                    try { el.setTime?.(0) } catch {}
                    try { (el as any).render?.() } catch {}
                    guardRaf = requestAnimationFrame(guard)
                }
                guardRaf = requestAnimationFrame(guard)
                raf1 = requestAnimationFrame(() => {
                    try { el.setTime?.(0) } catch {}
                    try { (el as any).render?.() } catch {}
                    // Reveal after we've explicitly rendered t=0 at least once on the next frame.
                    raf2 = requestAnimationFrame(() => {
                        revealSafely()
                        // Start playback shortly after reveal to avoid starting mid-tick on slower devices
                        raf3 = requestAnimationFrame(() => {
                            playTimer = window.setTimeout(() => {
                                try { el.play?.() } catch {}
                                try { el.setTime?.(0) } catch {}
                                // stop guard once we start playback
                                if (guardRaf) cancelAnimationFrame(guardRaf)
                                guardRaf = 0
                                // Keep rewinding to 0 for a few frames after play to defeat any initial dt
                                let n = postPlayFreezeFrames
                                const holdFewFrames = () => {
                                    if (n-- <= 0) return
                                    try { el.setTime?.(0) } catch {}
                                    requestAnimationFrame(holdFewFrames)
                                }
                                requestAnimationFrame(holdFewFrames)
                            }, playDelay)
                        })
                    })
                })
            }
            // Ensure the viewer element has non-zero size before starting the sequence
            const waitForSize = () => {
                const r = (el as HTMLElement).getBoundingClientRect()
                if (r.width > 1 && r.height > 1) {
                    // give layout one more frame to settle
                    raf1 = requestAnimationFrame(startSequence)
                } else {
                    raf1 = requestAnimationFrame(waitForSize)
                }
            }
            waitForSize()
        }

        // Prefer the official 'load-complete' event; fall back via timeout if an older viewer is used
        try { el.addEventListener?.('load-complete', onLoadAny) } catch {}
        // We already reset poster on URL change elsewhere; no need to react to 'load-start'

        // Fallback: if 'load-complete' never fires (older viewer), reveal and start anyway after ~4s
        const timeout = window.setTimeout(() => { onLoadAny(); revealSafely() }, 4000)
        return () => {
            try { el.removeEventListener?.('load-complete', onLoadAny) } catch {}
            if (raf1) cancelAnimationFrame(raf1)
            if (raf2) cancelAnimationFrame(raf2)
            if (raf3) cancelAnimationFrame(raf3)
            if (playTimer) window.clearTimeout(playTimer)
            if (guardRaf) cancelAnimationFrame(guardRaf)
            window.clearTimeout(timeout)
        }
    }, [viewerRef.current, sceneUrl, variant])

    // Fit box: compute inner size based on requested mode
    let innerW = box.w
    let innerH = Math.round(innerW * ASPECT)
    const fit: 'contain' | 'cover' = 'contain'
    if (fit === "contain") {
        if (innerH > box.h) {
            innerH = box.h
            innerW = Math.round(innerH / ASPECT)
        }
    } else {
        // cover
        if (innerH < box.h) {
            const s = box.h / Math.max(1, innerH)
            innerW = Math.round(innerW * s)
            innerH = Math.round(innerH * s)
        }
    }

    // Downscale actual render resolution to improve performance (then scale up visually)
    const rs = 1

    // Wrapper centers content; inner box is aspect-correct; viewer fills inner box
    const wrapperStyle: React.CSSProperties = {
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: 'transparent',
    }
    const innerStyle: React.CSSProperties = {
        position: "relative",
        width: innerW || "100%",
        height: innerH || Math.round((box.w || INTRINSIC_W) * ASPECT),
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
    }
    const fillStyle: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        display: "block",
        width: "100%",
        height: "100%",
        border: 0,
        outline: "none",
        minWidth: 2,
        minHeight: 2,
    }

    // Render box is smaller for performance, scaled up to fit
    const renderBoxStyle: React.CSSProperties = {
        position: "relative",
        width: Math.ceil((innerW || 0) * rs) || "100%",
        height: Math.ceil((innerH || 0) * rs) || Math.round((box.w || INTRINSIC_W) * ASPECT * rs),
        transform: rs !== 1 ? `scale(${1 / rs})` : undefined,
        transformOrigin: "50% 50%",
        overflow: "hidden",
    }

    const posterStyle: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: 'contain',
        background: 'transparent',
        display: ready ? "none" : "block",
        pointerEvents: "none",
    }

    return (
        <div ref={containerRef} style={wrapperStyle}>
            {sceneUrl ? (
                <div style={innerStyle}>
                    <div style={renderBoxStyle}>
                        {hasSize ? (
                            <spline-viewer
                                ref={viewerRef as any}
                                url={sceneUrl}
                                loading="auto"
                                events-target="local"
                                loading-anim="true"
                                style={fillStyle as any}
                            />
                        ) : null}
                        {derivedPoster ? (
                            <img alt="poster" src={derivedPoster} style={posterStyle} />
                        ) : null}
                    </div>
                </div>
            ) : (
                derivedPoster ? (
                    <img alt="poster" src={derivedPoster} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'transparent' }} />
                ) : <div style={{ ...fillStyle, background: 'transparent' }} />
            )}
        </div>
    )
}

;(SelfHostedSpline as any).defaultProps = { width: INTRINSIC_W, height: INTRINSIC_H }

addPropertyControls(SelfHostedSpline, {
    repoUrl: {
        type: ControlType.String,
        title: "GitHub Pages URL",
        defaultValue: "https://mojavestudio.github.io/mojave_ufo/",
        placeholder: "https://<user>.github.io/<repo>/",
    },
})

export default SelfHostedSpline
