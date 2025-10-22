// SelfHostedSpline.tsx
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

const Spline = React.lazy(() => import("@splinetool/react-spline"))

type Props = {
  gitHubUrl: string
}

export default function SelfHostedSpline({ gitHubUrl }: Props) {
  const isStatic = useIsStaticRenderer()
  const [mounted, setMounted] = React.useState(false)

  // Simple mount after hydration to avoid SSR issues
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (isStatic || !mounted) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          backgroundColor: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: "14px",
        }}
      >
        Loading 3D scene...
      </div>
    )
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <React.Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>Loading...</div>}>
        <Spline
          scene={gitHubUrl}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
          }}
        />
      </React.Suspense>
    </div>
  )
}

addPropertyControls(SelfHostedSpline, {
  gitHubUrl: {
    type: ControlType.String,
    title: "GitHub URL",
    defaultValue: "https://mojavestudio.github.io/mojave_ufo/scene.splinecode",
  },
})