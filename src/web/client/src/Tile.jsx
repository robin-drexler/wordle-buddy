import { h } from "preact";

export function Tile({ letter = "", status = "", reveal = false }) {
  // pick background for the back face based on status
  const backColor =
    status === "correct"
      ? "#6aaa64"
      : status === "present"
      ? "#c9b458"
      : status === "absent"
      ? "#525558"
      : "transparent";

  const innerStyle = {
    transform: reveal ? "rotateX(-180deg)" : "none",
    transition: "transform 600ms ease-in-out",
    transformStyle: "preserve-3d",
    WebkitTransformStyle: "preserve-3d",
  };

  const faceCommon = {
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  return (
    <div
      className="w-12 h-12 sm:w-14 sm:h-14 inline-flex items-center justify-center border border-white/12 rounded-md overflow-hidden relative"
      style={{ perspective: "1000px" }}
      aria-hidden
    >
      <div style={innerStyle} className="w-full h-full relative">
        <div
          style={{ ...faceCommon, transform: "rotateX(0deg)" }}
          className="absolute inset-0 flex items-center justify-center bg-white/6 text-gray-200 text-lg sm:text-xl font-extrabold uppercase"
        >
          {String(letter || "").toUpperCase()}
        </div>

        <div
          style={{
            ...faceCommon,
            transform: "rotateX(180deg)",
            backgroundColor: backColor,
          }}
          className="absolute inset-0 flex items-center justify-center text-white text-lg sm:text-xl font-extrabold uppercase"
        >
          {String(letter || "").toUpperCase()}
        </div>
      </div>
    </div>
  );
}
