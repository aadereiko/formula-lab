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
 * Three nested elements, because each owns one transform and a single element
 * cannot hold three: the body carries the resting orientation and the idle
 * turn, the spinner carries the hover turn, and one small cube rides along and
 * detaches on its own schedule.
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

        {/* The piece that comes loose. Three faces is all a corner shows. */}
        <span className="cube3d-chip">
          <span className="chip-face is-front" />
          <span className="chip-face is-top" />
          <span className="chip-face is-right" />
        </span>
      </span>
    </span>
  );
}
