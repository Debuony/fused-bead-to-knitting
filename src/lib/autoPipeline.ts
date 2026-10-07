import { useProject } from '../store/projectStore';
import { useSettings } from '../store/settingsStore';
import { autoCrop, autoMainYarn, autoPixelize } from './auto';
import { FULL_CROP, canvasImageData, workingImage } from './imageUtils';
import { getPalette } from './palettes';

/**
 * "One click": crop, pixelize, clean up and choose the main yarn automatically,
 * then jump to the scarf step. Uses the current photo in the project store.
 */
export async function runFullAuto(): Promise<{ detected: boolean }> {
  const project = useProject.getState();
  const settings = useSettings.getState();
  if (!project.image) throw new Error('no image');
  const full = await workingImage(project.image, 0, FULL_CROP, 600);
  const crop = autoCrop(canvasImageData(full));
  project.setTransform({ rotation: 0, crop });
  const work = await workingImage(project.image, 0, crop);
  const palette = getPalette(project.pixelOptions.paletteId, settings.customPalettes)?.colors;
  const res = autoPixelize(canvasImageData(work), palette);
  project.setPixelOptions({ gridW: res.gridW, gridH: res.gridH, maxColors: res.maxColors, removeBg: res.removeBg, bgTol: 0 });
  project.commitGrid(res.grid);
  project.setChartOptions({
    bgHex: autoMainYarn(res.grid),
    motifWidthSts: 0,
    scarfWidthSts: settings.scarfWidthSts,
    placement: 'ends',
    yarnOverrides: {},
  });
  project.goTo(4);
  return { detected: res.detected };
}
