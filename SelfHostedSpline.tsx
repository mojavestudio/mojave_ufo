// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

// Lazy import to keep initial render light; React is a peer (no duplicate Reacts)
const Spline = React.lazy(() => import("@splinetool/react-spline"))

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

    /** Performance */
    renderOnDemand: boolean
    mountWhenInView: boolean
    preflightCheck: boolean

    /** Per-breakpoint zoom */
    mobileZoom: number
    tabletZoom: number
    desktopZoom: number
    
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

        renderOnDemand = true,
        mountWhenInView = true,
        preflightCheck = true,

        mobileZoom = 1,
        tabletZoom = 1,
        desktopZoom = 1,

        fallbackMessage = "Spline scene URL failed to load (404/blocked). Check the path or host.",
        className,
    } = props

    const isStatic = useIsStaticRenderer() // don’t spin up WebGL on canvas/static export
    const ref = React.useRef<HTMLDivElement | null>(null)

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
        if (!mountWhenInView || !ref.current) return
        const node = ref.current
        const io = new IntersectionObserver(
            ([entry]) => setInView(entry.isIntersecting),
            { root: null, rootMargin: "200px 0px", threshold: 0.01 }
        )
        io.observe(node)
        return () => io.disconnect()
    }, [mountWhenInView])

    // Use dvh/svh fallback to fix mobile vh bugs
    const supportsDVH = typeof CSS !== "undefined" && CSS.supports("height", "100dvh")
    const supportsSVH = typeof CSS !== "undefined" && CSS.supports("height", "100svh")

    const heightStr = supportsDVH
        ? `${heightForBp}dvh`
        : supportsSVH
        ? `${heightForBp}svh`
        : `${heightForBp}vh`

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

    // On static canvas/exports, show a lightweight placeholder
    if (isStatic) {
        return (
            <div
                ref={ref}
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
        <div ref={ref} className={className} style={style}>
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
                            // Apply per-breakpoint zoom
                            try {
                                if (Number.isFinite(zoomForBp) && zoomForBp > 0)
                                    app.setZoom(zoomForBp)
                            } catch {
                                /* ignore */
                            }
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
        optionTitles: ["Fill Frame", "Viewport (vh)"],
        defaultValue: "vh",
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
    mobileZoom: {
        type: ControlType.Number,
        title: "Mobile Zoom",
        min: 0.1,
        max: 5,
        step: 0.1,
        displayStepper: true,
        defaultValue: 1,
    },
    tabletZoom: {
        type: ControlType.Number,
        title: "Tablet Zoom",
        min: 0.1,
        max: 5,
        step: 0.1,
        displayStepper: true,
        defaultValue: 1,
    },
    desktopZoom: {
        type: ControlType.Number,
        title: "Desktop Zoom",
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
