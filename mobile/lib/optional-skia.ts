type SkiaModule = typeof import('@shopify/react-native-skia');

let cached: SkiaModule | null | undefined;

export function getSkia(): SkiaModule | null {
  if (cached !== undefined) return cached;
  try {
    // In Expo Go, Skia native module may be unavailable. Keep it optional.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('@shopify/react-native-skia') as SkiaModule;
  } catch {
    cached = null;
  }
  return cached;
}

