interface Props {
  size?: number;
}

const FACES = ["front", "back", "right", "left", "top", "bottom"] as const;
const CELLS = [0, 1, 2, 3];

/**
 * The app mark as a real cube: six faces in CSS 3D, each divided into four
 * cells.
 *
 * The flat isometric drawing (see `Logo`) cannot rotate horizontally — spinning
 * a picture of a cube reads as a spinning picture. With actual faces, a
 * `rotateY` is a turntable, which is what a cube turning looks like.
 *
 * Two nested elements, because each owns one transform and a single element
 * cannot hold both: the body carries the resting orientation and the idle turn,
 * the spinner carries the hover turn.
 */
export function CubeMark({ size = 24 }: Props) {
  return (
    <span
      className="cube3d"
      style={{ ["--cube" as string]: `${size}px` }}
      aria-hidden="true"
    >
      <span className="cube3d-body">
        <span className="cube3d-spin">
          {FACES.map((face) => (
            <span key={face} className={`cube3d-face is-${face}`}>
              {CELLS.map((cell) => (
                <span key={cell} className="cube3d-cell" />
              ))}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
