import { describe, expect, it } from 'vitest';
import { deltaE, hexToRgb, nearestIndex, rgbToHex, rgbToLab } from '../src/lib/color';

describe('color', () => {
  it('round-trips hex', () => {
    expect(rgbToHex(hexToRgb('#3a7fc4'))).toBe('#3a7fc4');
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });
  it('converts white and black to Lab', () => {
    const w = rgbToLab([255, 255, 255]);
    expect(w[0]).toBeCloseTo(100, 0);
    expect(Math.abs(w[1])).toBeLessThan(0.5);
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 1);
  });
  it('finds the nearest colour', () => {
    const labs = ['#ff0000', '#00ff00', '#0000ff'].map((h) => rgbToLab(hexToRgb(h)));
    expect(nearestIndex(rgbToLab([230, 20, 30]), labs)).toBe(0);
    expect(nearestIndex(rgbToLab([20, 40, 220]), labs)).toBe(2);
    expect(deltaE(labs[0], labs[0])).toBe(0);
  });
});
