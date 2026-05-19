import { useTransform, type MotionValue } from 'motion/react';

export const LANDING_SLIDE_COUNT = 7;

export function useLandingSlideMotion(scrollXProgress: MotionValue<number>, slideIndex: number) {
  const slice = 1 / (LANDING_SLIDE_COUNT - 1);
  const maxIndex = LANDING_SLIDE_COUNT - 1;
  const center = slideIndex / maxIndex;
  const start = Math.max(0, center - slice * 0.5);
  const end = Math.min(1, center + slice * 0.5);
  const mid = center;

  /** Progresso reale: scroll va da 0 a 1 su (n-1) passi, non n slice uguali. */
  const halfBand = slice * 0.42;

  const textOpacity = useTransform(
    scrollXProgress,
    [Math.max(0, center - halfBand), center, Math.min(1, center + halfBand)],
    [0.15, 1, 0.15]
  );

  const textX = useTransform(scrollXProgress, [0, 1], [0, 0]);
  const textRotateY = useTransform(scrollXProgress, [0, 1], [0, 0]);

  const phoneOpacity = useTransform(
    scrollXProgress,
    [Math.max(0, center - halfBand), center, Math.min(1, center + halfBand)],
    [0.55, 1, 0.55]
  );

  const phoneBand = (1 / maxIndex) * 0.5;
  const phoneStart = Math.max(0, center - phoneBand);
  const phoneEnd = Math.min(1, center + phoneBand);
  const phoneMid = center;

  return {
    start,
    end,
    mid,
    slice,
    textOpacity,
    textX,
    textRotateY,
    phoneOpacity,
    phoneStart,
    phoneMid,
    phoneEnd,
  };
}
