import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

// Simple, stable Spline component that self-sizes and avoids import conflicts
export default function SelfHostedSpline({
  gitHubBaseUrl = "https://mojavestudio.github.io/mojave_ufo/",
  mobileFileName = "scene-mobile.splinecode",
  desktopFileName = "scene.splinecode",
  aspectRatio = 16 / 9,
  zoom = 1,
  className,
  style,
  ...rest
}: {
  gitHubBaseUrl?: string
  mobileFileName?: string
  desktopFileName?: string
  aspectRatio?: number
  zoom?: number
  className?: string
  style?: React.CSSProperties
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 })
  const [isMobile, setIsMobile] = React.useState(false)

  // Measure container and detect mobile
  React.useEffect(() => {
    if (!containerRef.current) return

    const updateSize = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const mobile = window.innerWidth <= 640
      setIsMobile(mobile)
      
      // Calculate height from width using aspect ratio
      const width = rect.width
      const height = width > 0 ? Math.round(width / aspectRatio) : 0
      
      setContainerSize({ width, height })
      
      // Set the actual DOM height to prevent jumping
      if (height > 0) {
        containerRef.current.style.height = `${height}px`
      }
    }

    // Initial measurement
    updateSize()

    // Listen for changes
    const ro = new ResizeObserver(updateSize)
    ro.observe(containerRef.current)
    window.addEventListener('resize', updateSize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [aspectRatio])

  // Build scene URL
  const sceneFile = isMobile ? mobileFileName : desktopFileName
  const sceneUrl = React.useMemo(() => {
    const base = gitHubBaseUrl.replace(/\/+$/, "") + "/"
    return base + sceneFile.replace(/^\/+/, "")
  }, [gitHubBaseUrl, sceneFile])

  // Only render when we have a stable size
  const canRender = containerSize.width > 0 && containerSize.height > 0

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: "100%",
        aspectRatio: aspectRatio,
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      {canRender && (
        <iframe
          src={sceneUrl}
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            position: "absolute",
            top: 0,
            left: 0,
          }}
          allow="fullscreen; autoplay; xr-spatial-tracking"
          loading="lazy"
        />
      )}
    </div>
  )
}

addPropertyControls(SelfHostedSpline, {
  gitHubBaseUrl: {
    type: ControlType.String,
    title: "GitHub Base URL",
    defaultValue: "https://mojavestudio.github.io/mojave_ufo/",
  },
  mobileFileName: {
    type: ControlType.String,
    title: "Mobile Scene",
    defaultValue: "scene-mobile.splinecode",
  },
  desktopFileName: {
    type: ControlType.String,
    title: "Desktop Scene", 
    defaultValue: "scene.splinecode",
  },
  aspectRatio: {
    type: ControlType.Number,
    title: "Aspect Ratio (W/H)",
    defaultValue: 16 / 9,
    min: 0.1,
    max: 10,
    step: 0.1,
  },
  zoom: {
    type: ControlType.Number,
    title: "Zoom",
    defaultValue: 1,
    min: 0.1,
    max: 5,
    step: 0.1,
  },
})