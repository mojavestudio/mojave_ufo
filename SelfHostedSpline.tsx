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
    fit?: "contain" | "cover"
    backdrop?: string
    quality?: number
    posterUrl?: string
    posterFit?: "contain" | "cover"
    style?: React.CSSProperties
    className?: string
}

const INTRINSIC_W = 1200
const INTRINSIC_H = 700
const ASPECT = INTRINSIC_H / INTRINSIC_W
const VIEWER_VERSION = "1.10.56"

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
        const plId = `preload:${sceneUrl}`
        if (!document.getElementById(plId)) {
            const l = document.createElement("link")
            l.id = plId
            l.rel = "preload"
            l.as = "fetch"
            l.href = sceneUrl
            l.crossOrigin = "anonymous"
            document.head.appendChild(l)
        }
    } catch {}
}

/* ---------- Component ---------- */
function SelfHostedSpline({
    repoUrl = "https://github.com/mojavestudio/mojave_ufo",
    fit = "contain",
    backdrop = "transparent",
    quality = 1,
    posterUrl,
    posterFit = "contain",
    style,
    className,
}: Props) {
    const isCanvas = RenderTarget.current() === RenderTarget.canvas
    const containerRef = R.useRef<HTMLDivElement | null>(null)
    const liveViewerRef = R.useRef<HTMLElement | null>(null)

    const sceneUrl = R.useMemo(() => deriveSceneUrlFromRepo(repoUrl), [repoUrl])
    const derivedPoster = R.useMemo(() => posterUrl || derivePosterUrlFromRepo(repoUrl), [posterUrl, repoUrl])

    // Measure parent size for letterboxed "contain" layout
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

    // Load viewer script and set attributes after mount
    const [ready, setReady] = R.useState(false)

    R.useEffect(() => {
        if (isCanvas || !sceneUrl) return
        let mounted = true
        ;(async () => {
            hintNetwork(sceneUrl)
            await ensureSplineViewer()
            if (!mounted) return
            const el = liveViewerRef.current
            if (el) {
                el.setAttribute("events-target", "local")
                el.setAttribute("loading-anim", "true")
                const onLoad = () => setReady(true)
                el.addEventListener?.("load", onLoad as any)
                // Fallback: ensure we don't keep poster forever
                const t = setTimeout(() => setReady(true), 4000)
                return () => {
                    clearTimeout(t)
                    el.removeEventListener?.("load", onLoad as any)
                }
            }
        })().catch(() => {})
        return () => {
            mounted = false
            try {
                const el = liveViewerRef.current
                if (el) el.setAttribute("url", "")
            } catch {}
        }
    }, [isCanvas, sceneUrl])

    // Fit box: compute inner size based on requested mode
    let innerW = box.w
    let innerH = Math.round(innerW * ASPECT)
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
    const rs = Math.min(1, Math.max(0.5, quality || 1))

    // Wrapper centers content; inner box is aspect-correct; viewer fills inner box
    const wrapperStyle: React.CSSProperties = {
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: backdrop,
        ...style,
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
    }

    // Render box is smaller for performance, scaled up to fit
    const renderBoxStyle: React.CSSProperties = {
        position: "relative",
        width: Math.round((innerW || 0) * rs) || "100%",
        height: Math.round((innerH || 0) * rs) || Math.round((box.w || INTRINSIC_W) * ASPECT * rs),
        transform: rs !== 1 ? `scale(${1 / rs})` : undefined,
        transformOrigin: "50% 50%",
    }

    const posterStyle: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: posterFit,
        background: backdrop,
        display: ready ? "none" : "block",
        pointerEvents: "none",
    }

    return (
        <div ref={containerRef} className={className} style={wrapperStyle}>
            {!isCanvas && sceneUrl ? (
                <div style={innerStyle}>
                    <div style={renderBoxStyle}>
                        <spline-viewer
                            ref={liveViewerRef as any}
                            url={sceneUrl}
                            style={fillStyle}
                        />
                        {derivedPoster ? (
                            <img alt="poster" src={derivedPoster} style={posterStyle} />
                        ) : null}
                    </div>
                </div>
            ) : (
                derivedPoster ? (
                    <img alt="poster" src={derivedPoster} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: posterFit, background: backdrop }} />
                ) : (
                    <div style={{ ...fillStyle, background: "#000" }} />
                )
            )}
        </div>
    )
}

;(SelfHostedSpline as any).defaultProps = { width: INTRINSIC_W, height: INTRINSIC_H }

addPropertyControls(SelfHostedSpline, {
    repoUrl: {
        type: ControlType.String,
        title: "GitHub Repo",
        defaultValue: "https://github.com/mojavestudio/mojave_ufo",
    },
    fit: {
        type: ControlType.Enum,
        title: "Fit",
        options: ["contain", "cover"],
        optionTitles: ["Contain", "Cover"],
        defaultValue: "contain",
    },
    backdrop: {
        type: ControlType.Color,
        title: "Backdrop",
        defaultValue: "rgba(0,0,0,0)",
    },
    quality: {
        type: ControlType.Number,
        title: "Quality",
        min: 0.5,
        max: 1,
        step: 0.05,
        defaultValue: 1,
        displayStepper: false,
        unit: "×",
    },
    posterUrl: {
        type: ControlType.String,
        title: "Poster URL",
        defaultValue: "",
        placeholder: "auto from repo…",
    },
    posterFit: {
        type: ControlType.Enum,
        title: "Poster Fit",
        options: ["contain", "cover"],
        optionTitles: ["Contain", "Cover"],
        defaultValue: "contain",
    },
})

export default SelfHostedSpline
