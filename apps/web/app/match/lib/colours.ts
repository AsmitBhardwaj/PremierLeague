export const INK = '#111611';
export const CREAM = '#F5F1E4';

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

/**
 * The user's pitch colour: their club primary, falling back to ink when it is missing, invalid or
 * so close to the cream opponent colour that the two sides could not be told apart.
 */
export function userDotColour(primary: string | undefined): string {
  if (!primary || !/^#[0-9a-f]{6}$/i.test(primary)) return INK;
  const a = luminance(primary) + 0.05;
  const b = luminance(CREAM) + 0.05;
  const contrast = Math.max(a, b) / Math.min(a, b);
  return contrast < 1.6 ? INK : primary;
}
