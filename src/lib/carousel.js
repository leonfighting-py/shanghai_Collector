export const CAROUSEL_INTERVAL_MS = 8000;

export function nextCarouselIndex(currentIndex, direction, total) {
  if (total <= 0) return 0;
  return (currentIndex + direction + total) % total;
}
