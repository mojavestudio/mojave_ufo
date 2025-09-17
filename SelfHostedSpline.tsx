// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

// tiny debounce via rAF to avoid repeated zoom during layout thrash
function rafDebounce<T extends (...args: any[]) => void>(fn: T) {
    let raf = 0
    return (...args: Parameters<T>) => {
        if (raf) cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => fn(...args))
    }
}

// Lazy import to keep initial render light; React is a peer (no duplicate Reacts)
const Spline = React.lazy(() => import("@splinetool/react-spline"))

// Extend Props with fit/zoom controls and per-breakpoint sizes
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

    /** Component sizing */
    heightMode: "frame" | "vh"
    mobileHeightVh: number
    tabletHeightVh: number
    desktopHeightVh: number
    /** Which viewport height unit to use when heightMode === 'vh' */
    viewportUnit?: "vh" | "svh" | "dvh" | "auto"

    /** Performance */
    renderOnDemand: boolean
    mountWhenInView: boolean
    preflightCheck: boolean

    /** Per-breakpoint zoom (used when fitMode === "none") */
    mobileZoom: number
    tabletZoom: number
    desktopZoom: number

    /** Fit/zoom logic */
    fitMode: "none" | "contain" | "cover"
    designWidth: number
    designHeight: number
    mobileDesignWidth: number
    mobileDesignHeight: number
    tabletDesignWidth: number
    tabletDesignHeight: number
    desktopDesignWidth: number
    desktopDesignHeight: number
    minZoom: number
    maxZoom: number

    fallbackMessage: string
    className?: string
}

export default function SelfHostedSpline(props: Props) {
    const {
        gitHubBaseUrl = "https://mojavestudio.github.io/mojave_ufo/",
        mobileFileName = "scene-mobile.splinecode",
        tabletFileName = "scene.splinecode",
        desktopFileName = "scene.splinecode",
        splineProdUrl = "",

        heightMode = "vh",
        mobileHeightVh = 120,
        tabletHeightVh = 150,
        desktopHeightVh = 170,
        viewportUnit = "svh",

        renderOnDemand = true,
        mountWhenInView = true,
        preflightCheck = true,

        mobileZoom = 1,
        tabletZoom = 1,
        desktopZoom = 1,

        fitMode = "contain",
        designWidth = 1440,
        designHeight = 900,
        mobileDesignWidth = 390,
        mobileDesignHeight = 844,
        tabletDesignWidth = 834,
        tabletDesignHeight = 1112,
        desktopDesignWidth = 1440,
        desktopDesignHeight = 900,
        minZoom = 0.25,
        maxZoom = 3,

        fallbackMessage = "Spline scene URL failed to load (404/blocked). Check the path or host.",
        className,
    } = props

    const isStatic = useIsStaticRenderer() // don’t spin up WebGL on canvas/static export
    const hostRef = React.useRef<HTMLDivElement | null>(null)
    const appRef = React.useRef<any>(null)
    const lastSize = React.useRef<{ w: number; h: number }>({ w: 0, h: 0 })

    // Optional JS-managed stable "vh" when viewportUnit === 'auto'
    React.useEffect(() => {
        if (heightMode !== "vh" || viewportUnit !== "auto") return
        const setVH = () => {
            const vv: any = (window as any).visualViewport
            const h = vv?.height ?? window.innerHeight
            document.documentElement.style.setProperty("--vh", `${h * 0.01}px`)
        }
        setVH()
        window.addEventListener("resize", setVH)
        ;(window as any).visualViewport?.addEventListener("resize", setVH)
        return () => {
            window.removeEventListener("resize", setVH)
            ;(window as any).visualViewport?.removeEventListener("resize", setVH)
        }
    }, [heightMode, viewportUnit])

    const [inView, setInView] = React.useState<boolean>(!mountWhenInView)
    const [resolvedUrl, setResolvedUrl] = React.useState<string>("")
    const [error, setError] = React.useState<string>("")

    // Responsive scene selection with stable matchMedia
    const [currentBreakpoint, setCurrentBreakpoint] = React.useState<'mobile' | 'tablet' | 'desktop'>('desktop')
    
    React.useEffect(() => {
        const mMobile = window.matchMedia("(max-width: 640px)")
        const mTablet = window.matchMedia("(min-width: 641px) and (max-width: 1024px)")

        const apply = () => {
            if (mMobile.matches) setCurrentBreakpoint("mobile")
            else if (mTablet.matches) setCurrentBreakpoint("tablet")
            else setCurrentBreakpoint("desktop")
        }
        
        apply()
        mMobile.addEventListener("change", apply)
        mTablet.addEventListener("change", apply)
        window.addEventListener("orientationchange", apply)
        
        return () => {
            mMobile.removeEventListener("change", apply)
            mTablet.removeEventListener("change", apply)
            window.removeEventListener("orientationchange", apply)
        }
    }, [])

    // Get the appropriate scene file based on breakpoint
    const getSceneFile = React.useCallback(() => {
        switch (currentBreakpoint) {
            case 'mobile':
                return mobileFileName
            case 'tablet':
                return tabletFileName
            case 'desktop':
                return desktopFileName
            default:
                return desktopFileName
        }
    }, [currentBreakpoint, mobileFileName, tabletFileName, desktopFileName])

    // Compute per-breakpoint settings
    const heightForBp = React.useMemo(() => {
        switch (currentBreakpoint) {
            case "mobile": return mobileHeightVh
            case "tablet": return tabletHeightVh
            default: return desktopHeightVh
        }
    }, [currentBreakpoint, mobileHeightVh, tabletHeightVh, desktopHeightVh])

    const zoomForBp = React.useMemo(() => {
        switch (currentBreakpoint) {
            case "mobile": return mobileZoom
            case "tablet": return tabletZoom
            default: return desktopZoom
        }
    }, [currentBreakpoint, mobileZoom, tabletZoom, desktopZoom])

    // Normalize base URL and build the responsive GH URL
    const ghUrl = React.useMemo(() => {
        const base = (gitHubBaseUrl || "").replace(/\/+$/, "") + "/"
        const sceneFile = getSceneFile()
        return base + (sceneFile || "").replace(/^\/+/, "")
    }, [gitHubBaseUrl, getSceneFile])

    // Preflight: try GH → fallback to Spline prod
    React.useEffect(() => {
        let cancelled = false
        setError("")
        setResolvedUrl("")

        async function ok(url: string) {
            try {
                // HEAD first; some hosts block it -> fall back to GET
                const h = await fetch(url, {
                    method: "HEAD",
                    cache: "no-store",
                    mode: "cors" as RequestMode,
                })
                if (h.ok) return true
            } catch {}
            try {
                const g = await fetch(url, {
                    method: "GET",
                    cache: "no-store",
                    mode: "cors" as RequestMode,
                })
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
                setError(
                    `Could not load: ${ghUrl || splineProdUrl || "(no url)"}`
                )
            }
        })()

        return () => {
            cancelled = true
        }
    }, [ghUrl, splineProdUrl, preflightCheck])

    // Mount only when visible to avoid overlapping Three scenes
    React.useEffect(() => {
        if (!mountWhenInView || !hostRef.current) return
        const node = hostRef.current
        const io = new IntersectionObserver(
            ([entry]) => setInView(entry.isIntersecting),
            { root: null, rootMargin: "200px 0px", threshold: 0.01 }
        )
        io.observe(node)
        return () => io.disconnect()
    }, [mountWhenInView])

    // Resolve height string based on selected viewport unit
    const heightStr = React.useMemo(() => {
        if (heightMode !== "vh") return "100%"
        if (viewportUnit === "auto") return `calc(var(--vh, 1vh) * ${heightForBp})`
        // Validate support; fall back to vh if not supported
        try {
            // @ts-ignore
            const ok = (window as any)?.CSS?.supports?.("height", `100${viewportUnit}`)
            const unit = ok ? viewportUnit : "vh"
            return `${heightForBp}${unit}`
        } catch {
            return `${heightForBp}vh`
        }
    }, [heightMode, viewportUnit, heightForBp])

    // Sizing: either fill the Framer frame, or use responsive vh with modern viewport units
    const style: React.CSSProperties =
        heightMode === "frame"
            ? { width: "100%", height: "100%", overflow: "hidden" }
            : {
                  width: "100%",
                  height: heightStr,
                  overflow: "hidden",
                  overscrollBehavior: "contain",
                  WebkitOverflowScrolling: "touch",
              }

    // Fit/zoom calculation
    const getDesignSize = React.useCallback((): [number, number] => {
        if (currentBreakpoint === "mobile" && mobileDesignWidth && mobileDesignHeight) return [mobileDesignWidth, mobileDesignHeight]
        if (currentBreakpoint === "tablet" && tabletDesignWidth && tabletDesignHeight) return [tabletDesignWidth, tabletDesignHeight]
        if (currentBreakpoint === "desktop" && desktopDesignWidth && desktopDesignHeight) return [desktopDesignWidth, desktopDesignHeight]
        return [designWidth, designHeight]
    }, [currentBreakpoint, mobileDesignWidth, mobileDesignHeight, tabletDesignWidth, tabletDesignHeight, desktopDesignWidth, desktopDesignHeight, designWidth, designHeight])

    const _applyZoom = React.useCallback(() => {
        if (!appRef.current || !hostRef.current) return
        const rect = hostRef.current.getBoundingClientRect()
        // ignore if size hasn't actually changed (prevents micro-jitter)
        if (
            Math.abs(rect.width - lastSize.current.w) < 1 &&
            Math.abs(rect.height - lastSize.current.h) < 1
        ) return
        lastSize.current = { w: rect.width, h: rect.height }

        const [dw, dh] = getDesignSize()
        let next = zoomForBp

        if (fitMode !== "none" && dw > 0 && dh > 0 && rect.width > 0 && rect.height > 0) {
            const zx = rect.width / dw
            const zy = rect.height / dh
            next = fitMode === "contain" ? Math.min(zx, zy) : Math.max(zx, zy)
        }

        // clamp
        next = Math.max(minZoom, Math.min(maxZoom, next))
        try { appRef.current.setZoom(next) } catch {}
    }, [fitMode, getDesignSize, minZoom, maxZoom, zoomForBp])

    // debounce it so we don’t thrash during initial layout
    const applyZoom = React.useMemo(() => rafDebounce(_applyZoom), [_applyZoom])

    // React to container resize & breakpoint changes
    React.useEffect(() => {
        if (!hostRef.current) return
        const ro = new ResizeObserver(() => applyZoom())
        ro.observe(hostRef.current)
        return () => ro.disconnect()
    }, [applyZoom])

    React.useEffect(() => { applyZoom() }, [currentBreakpoint, applyZoom])

    // On static canvas/exports, show a lightweight placeholder
    if (isStatic) {
        return (
            <div
                ref={hostRef}
                className={className}
                style={{ ...style, display: "grid", placeItems: "center" }}
            >
                <div style={{ opacity: 0.6, fontSize: 12 }}>
                    Spline preview (static)
                </div>
            </div>
        )
    }

    return (
        <div ref={hostRef} className={className} style={style}>
            <React.Suspense
                fallback={<div style={{ padding: 12 }}>Loading 3D…</div>}
            >
                {error ? (
                    <div style={{ padding: 12, fontSize: 14, lineHeight: 1.4 }}>
                        {fallbackMessage}
                        <br />
                        <code style={{ fontSize: 12 }}>{error}</code>
                    </div>
                ) : inView && resolvedUrl ? (
                    <Spline
                        scene={resolvedUrl}
                        renderOnDemand={renderOnDemand}
                        onLoad={(app) => {
                            appRef.current = app
                            applyZoom()
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
        placeholder: "https://<user>.github.io/<project>/",
    },
    mobileFileName: {
        type: ControlType.String,
        title: "Mobile Scene (≤640px)",
        defaultValue: "scene-mobile.splinecode",
        placeholder: "scene-mobile.splinecode",
    },
    tabletFileName: {
        type: ControlType.String,
        title: "Tablet Scene (641-1024px)",
        defaultValue: "scene.splinecode",
        placeholder: "scene-tablet.splinecode",
    },
    desktopFileName: {
        type: ControlType.String,
        title: "Desktop Scene (≥1025px)",
        defaultValue: "scene.splinecode",
        placeholder: "scene-desktop.splinecode",
    },
    splineProdUrl: {
        type: ControlType.String,
        title: "Spline Fallback",
        defaultValue: "",
        placeholder: "https://prod.spline.design/ID/scene.splinecode",
    },
    heightMode: {
        type: ControlType.SegmentedEnum,
        title: "Height Mode",
        options: ["frame", "vh"],
        optionTitles: ["Fill Frame", "Viewport (vh)"]
        ,
        defaultValue: "vh",
    },
    viewportUnit: {
        type: ControlType.SegmentedEnum,
        title: "Viewport Unit",
        options: ["svh", "dvh", "vh", "auto"],
        optionTitles: ["svh (stable)", "dvh (dynamic)", "vh (legacy)", "auto (JS)"],
        defaultValue: "svh",
        hidden: (p) => p.heightMode !== "vh",
    },
    mobileHeightVh: {
        type: ControlType.Number,
        title: "Mobile Height (vh)",
        min: 50,
        max: 300,
        step: 10,
        displayStepper: true,
        defaultValue: 120,
        hidden: (p) => p.heightMode !== "vh",
    },
    tabletHeightVh: {
        type: ControlType.Number,
        title: "Tablet Height (vh)",
        min: 50,
        max: 300,
        step: 10,
        displayStepper: true,
        defaultValue: 150,
        hidden: (p) => p.heightMode !== "vh",
    },
    desktopHeightVh: {
        type: ControlType.Number,
        title: "Desktop Height (vh)",
        min: 50,
        max: 400,
        step: 10,
        displayStepper: true,
        defaultValue: 170,
        hidden: (p) => p.heightMode !== "vh",
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

    // Fit/zoom controls
    fitMode: {
        type: ControlType.Enum,
        title: "Fit Mode",
        options: ["none", "contain", "cover"],
        optionTitles: ["Fixed Zoom", "Contain", "Cover"],
        defaultValue: "contain",
    },
    designWidth: { type: ControlType.Number, title: "Design W", defaultValue: 1440, min: 100, max: 4000, step: 10 },
    designHeight: { type: ControlType.Number, title: "Design H", defaultValue: 900, min: 100, max: 4000, step: 10 },

    mobileDesignWidth: { type: ControlType.Number, title: "Mobile W", defaultValue: 390, min: 100, max: 2000, step: 10 },
    mobileDesignHeight: { type: ControlType.Number, title: "Mobile H", defaultValue: 844, min: 100, max: 2000, step: 10 },
    tabletDesignWidth: { type: ControlType.Number, title: "Tablet W", defaultValue: 834, min: 100, max: 3000, step: 10 },
    tabletDesignHeight: { type: ControlType.Number, title: "Tablet H", defaultValue: 1112, min: 100, max: 3000, step: 10 },
    desktopDesignWidth: { type: ControlType.Number, title: "Desktop W", defaultValue: 1440, min: 100, max: 4000, step: 10 },
    desktopDesignHeight: { type: ControlType.Number, title: "Desktop H", defaultValue: 900, min: 100, max: 4000, step: 10 },

    minZoom: { type: ControlType.Number, title: "Min Zoom", defaultValue: 0.25, min: 0.05, max: 5, step: 0.05 },
    maxZoom: { type: ControlType.Number, title: "Max Zoom", defaultValue: 3, min: 0.1, max: 10, step: 0.1 },

    mobileZoom: { type: ControlType.Number, title: "Mobile Zoom", defaultValue: 1, min: 0.1, max: 5, step: 0.1, hidden: (p) => p.fitMode !== "none" },
    tabletZoom: { type: ControlType.Number, title: "Tablet Zoom", defaultValue: 1, min: 0.1, max: 5, step: 0.1, hidden: (p) => p.fitMode !== "none" },
    desktopZoom: { type: ControlType.Number, title: "Desktop Zoom", defaultValue: 1, min: 0.1, max: 5, step: 0.1, hidden: (p) => p.fitMode !== "none" },

    fallbackMessage: {
        type: ControlType.String,
        title: "Fallback Message",
        defaultValue:
            "Spline scene URL failed to load (404/blocked). Check the path or host.",
    },
})
