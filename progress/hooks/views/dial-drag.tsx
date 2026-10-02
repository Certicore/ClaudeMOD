// The limit dial's drag region: a Client surface module. It runs in the
// surface's own sandboxed frame, so it imports nothing at all (not even
// types): everything it needs comes through its two arguments.

/** What the region is handed: the range and grid it snaps to, the value shown now, the track's margins in cells. */
type DialDragProps = {
  min: number
  max: number
  step: number
  value: number
  inset: number
}

type DragState = {
  /** The last limit posted, so a move within one step posts nothing. */
  posted: number | null
  isDragging: boolean
}

type DialPointer = {
  type: 'down' | 'move' | 'up' | 'enter' | 'leave'
  x: number
  y: number
  fine?: { x: number; y: number }
  button?: 'left' | 'middle' | 'right'
}

type DialSurface = {
  readonly elements: { Box: (props: { width?: number; height?: number }) => unknown }
  readonly state: DragState | undefined
  setState: (next: DragState) => void
  readonly columns: number
  readonly rows: number
  onPointer: (fn: (event: DialPointer) => void) => () => void
  post: (data: unknown) => void
}

/**
 * An invisible layer laid over the dial's SVG. A press anywhere on it jumps
 * the knob there, a drag carries it, the release settles it; each step
 * crossed posts the snapped limit (`{ limit, isFinal }`) to the hooks
 * module, which redraws the dial under the pointer. Its first draw posts
 * `{ isReady: true }`, so the hooks module can drop the arrows it shows
 * until the region is known to work.
 */
export default function DialDrag(props: DialDragProps, surface: DialSurface): unknown {
  if (surface.state === undefined) {
    surface.setState({ posted: null, isDragging: false })
    surface.post({ isReady: true })
    surface.onPointer(event => {
      const state = surface.state ?? { posted: null, isDragging: false }
      const isPress = event.type === 'down' && event.button === 'left'
      const isDrag = event.type === 'move' && state.isDragging
      const isRelease = event.type === 'up' && state.isDragging

      if (!isPress && !isDrag && !isRelease) {
        return
      }

      const span = Math.max(1, surface.columns - props.inset * 2)
      const at = (event.fine?.x ?? event.x + 0.5) - props.inset
      const share = Math.max(0, Math.min(1, at / span))
      const snapped = Math.round((share * 100) / props.step) * props.step
      const limit = Math.max(props.min, Math.min(props.max, snapped))

      if (isRelease) {
        surface.setState({ posted: null, isDragging: false })
        surface.post({ limit, isFinal: true })

        return
      }

      if (limit !== state.posted) {
        surface.post({ limit, isFinal: false })
      }

      surface.setState({ posted: limit, isDragging: true })
    })
  }

  return surface.elements.Box({ width: Math.max(1, surface.columns), height: Math.max(1, surface.rows) })
}
