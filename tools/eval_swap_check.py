"""Face-swap artifact check validation on controlled videos.

Runs the production sampling pipeline (FaceTracker + faceconsistency) over
the given videos and prints the swap-signal aggregates:
  real footage      -> probability ~0
  swap synthetics   -> high probability

Usage: python tools/eval_swap_check.py video1.mp4 video2.mp4 ...
"""
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml-service"))

import app as appmod  # noqa: E402
import faceconsistency as fcs  # noqa: E402


def main() -> None:
    for arg in sys.argv[1:]:
        path = Path(arg)
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            print(f"{path.name:<28} UNREADABLE")
            continue
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        count = min(60, total)
        lo, hi = int(total * 0.02), max(int(total * 0.98) - 1, 1)
        wanted = {lo + int(round((hi - lo) * i / max(1, count - 1))) for i in range(count)}

        ratios, width = [], 0
        tracker = None
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if tracker is None:
                width = frame.shape[1]
                tracker = appmod.FaceTracker(frame.shape[1], frame.shape[0])
            if idx in wanted:
                _, raw_box = tracker.observe(frame)
                if raw_box is not None:
                    lr = fcs.frame_log_ratio(frame, raw_box)
                    if lr is not None:
                        ratios.append(lr)
                if len(ratios) >= count:
                    break
            idx += 1
        cap.release()

        agg = fcs.aggregate(ratios)
        if agg is None:
            print(f"{path.name:<28} insufficient frames ({len(ratios)})")
        else:
            print(
                f"{path.name:<28} p={agg['probability']:<5} mean={agg['meanLogRatio']:<7} "
                f"fracSmoother={agg['fracSmoother']:<6} n={agg['framesChecked']}"
            )


if __name__ == "__main__":
    main()
