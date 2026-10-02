import type { ClientModule } from 'claude-code'

/** What the dial's drag region is handed: the range and grid it snaps to, and the value shown now. */
export type DialDragProps = {
  min: number
  max: number
  step: number
  value: number
  /** Cells of the region's left and right margins where the track does not reach. */
  inset: number
}

/** What a drag tells the hooks module: the limit under the pointer, and whether the drag ended. */
export type DialDragPost = {
  limit: number
  isFinal: boolean
}

type DragState = {
  /** The last limit posted, so a move within one step posts nothing. */
  posted: number | null
  isDragging: boolean
}

/**
 * The limit dial's drag region: an invisible layer laid over the dial's
 * SVG. A press anywhere on it jumps the knob there, a drag carries it, the
 * release settles it; each step crossed posts the snapped limit to the
 * hooks module, which redraws the dial under the pointer.
 */
const DialDrag: ClientModule<DialDragProps, DragState> = (props, surface) => {
  if (surface.state === undefined) {
    surface.setState({ posted: null, isDragging: false })
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

  const { Box } = surface.elements

  return <Box width={Math.max(1, surface.columns)} height={Math.max(1, surface.rows)} />
}

export default DialDrag
