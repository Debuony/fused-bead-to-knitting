/**
 * Bead palettes. Hex values are approximations of each brand's colours —
 * real beads vary by batch and lighting. Add or edit entries freely.
 */
export interface PaletteColor {
  id: string;
  name: string;
  hex: string;
}

export interface Palette {
  id: string;
  label: string;
  colors: PaletteColor[];
}

const make = (prefix: string, list: [string, string][]): PaletteColor[] =>
  list.map(([name, hex], i) => ({ id: `${prefix}${String(i + 1).padStart(2, '0')}`, name, hex }));

const PERLER = make('P', [
  ['White', '#f1f1f1'], ['Black', '#2e2f32'], ['Grey', '#8a8d91'], ['Light Grey', '#c8c9cb'],
  ['Red', '#bf2e40'], ['Cherry', '#e34a5a'], ['Pink', '#e48dbb'], ['Light Pink', '#f6b3dd'],
  ['Bubblegum', '#e85ea0'], ['Magenta', '#c13e8e'], ['Plum', '#a24b9c'], ['Purple', '#6a3e8f'],
  ['Pastel Lavender', '#8b7bc4'], ['Dark Blue', '#2b3f87'], ['Cobalt', '#2d64b0'], ['Light Blue', '#3381c6'],
  ['Pastel Blue', '#6ca2d8'], ['Turquoise', '#2b9ac1'], ['Robin Egg', '#b0e2e0'], ['Teal', '#2d8f8a'],
  ['Dark Green', '#1d6d3c'], ['Green', '#1c8c4b'], ['Bright Green', '#4fb848'], ['Kiwi Lime', '#7cd04c'],
  ['Pastel Green', '#77c98d'], ['Yellow', '#ecd800'], ['Pastel Yellow', '#fef583'], ['Cheddar', '#f1aa0c'],
  ['Orange', '#ed6b1f'], ['Butterscotch', '#d3802b'], ['Rust', '#a43c27'], ['Brown', '#4e3528'],
  ['Light Brown', '#815d34'], ['Tan', '#bc9369'], ['Sand', '#e4b88e'], ['Peach', '#eec3b7'],
  ['Toasted Marshmallow', '#f1e1c6'], ['Creme', '#e3dcb7'], ['Blush', '#ff8a8a'], ['Fuchsia', '#d63c8a'],
]);

const HAMA = make('H', [
  ['White', '#f2f2f2'], ['Cream', '#efe3c3'], ['Yellow', '#f4d61a'], ['Orange', '#ef7d1f'],
  ['Red', '#c8202f'], ['Pink', '#ef9bc0'], ['Purple', '#6e4294'], ['Dark Blue', '#283a8c'],
  ['Light Blue', '#3c8fd3'], ['Green', '#25904c'], ['Light Green', '#5bba4c'], ['Brown', '#5c3a2b'],
  ['Grey', '#8f9295'], ['Black', '#272727'], ['Claret', '#7c1f35'], ['Tan', '#c49c72'],
  ['Skin', '#efc39c'], ['Pastel Yellow', '#f6ee9a'], ['Pastel Red', '#f08e8e'], ['Pastel Purple', '#a68ec9'],
  ['Pastel Blue', '#8bb8e3'], ['Pastel Green', '#99d0a0'], ['Turquoise', '#2fa4b4'], ['Light Grey', '#c9cacc'],
  ['Neon Pink', '#ff4fa0'], ['Raspberry', '#b0306b'], ['Olive', '#7b7f2f'], ['Beige', '#dccaa2'],
]);

const MARD = make('M', [
  ['A1 白 White', '#ffffff'], ['A2 米白 Ivory', '#f6efe0'], ['A3 浅黄 Lemon', '#fff3a3'], ['A4 黄 Yellow', '#ffd93b'],
  ['A5 橙黄 Amber', '#ffb627'], ['A6 橙 Orange', '#ff8a2b'], ['B1 浅粉 Baby Pink', '#ffd3df'], ['B2 粉 Pink', '#ff9ebb'],
  ['B3 玫红 Rose', '#f2558a'], ['B4 红 Red', '#e3263a'], ['B5 酒红 Wine', '#9a1f36'], ['C1 薰衣草 Lavender', '#c9b6ee'],
  ['C2 紫 Purple', '#8a5cc9'], ['C3 深紫 Violet', '#56318f'], ['D1 天蓝 Sky', '#9bd3f5'], ['D2 蓝 Blue', '#3b8fe0'],
  ['D3 宝蓝 Royal', '#2453b3'], ['D4 藏青 Navy', '#1d2b5c'], ['E1 薄荷 Mint', '#b7ecd2'], ['E2 绿 Green', '#36b45b'],
  ['E3 草绿 Grass', '#83c94a'], ['E4 墨绿 Forest', '#1f6440'], ['E5 湖蓝 Teal', '#1fa3a3'], ['F1 肤色 Skin', '#ffd9bd'],
  ['F2 杏 Apricot', '#f3b585'], ['F3 咖啡 Coffee', '#9a6640'], ['F4 深棕 Chocolate', '#5a3622'], ['G1 浅灰 Light Grey', '#d9d9d9'],
  ['G2 灰 Grey', '#9a9a9a'], ['G3 深灰 Dark Grey', '#5a5a5a'], ['G4 黑 Black', '#1e1e1e'], ['G5 奶咖 Latte', '#cbb497'],
]);

const ARTKAL = make('S', [
  ['White', '#fdfdfd'], ['Ivory', '#f4eccd'], ['Lemon', '#fbf27b'], ['Yellow', '#f8d322'], ['Gold', '#e9a91c'],
  ['Tangerine', '#f68b2c'], ['Orange', '#ec6626'], ['Coral', '#f47a6e'], ['Red', '#d8243b'], ['Crimson', '#a3192f'],
  ['Baby Pink', '#fbd0dc'], ['Pink', '#f59bbd'], ['Hot Pink', '#ea4f93'], ['Magenta', '#c4307e'], ['Lilac', '#d6bfe8'],
  ['Lavender', '#a990d4'], ['Purple', '#7444a6'], ['Grape', '#4f2c7a'], ['Ice Blue', '#cfe9f7'], ['Sky Blue', '#8ccaf0'],
  ['Azure', '#3a9ee0'], ['Blue', '#2266be'], ['Navy', '#1c2d64'], ['Aqua', '#8fe0d8'], ['Teal', '#16979a'],
  ['Mint', '#bdeccb'], ['Lime', '#a6d84a'], ['Green', '#2fa24f'], ['Forest', '#1b5e37'], ['Olive', '#7d8a37'],
  ['Cream', '#f6e2c3'], ['Peach', '#f9c4a0'], ['Tan', '#d2a273'], ['Caramel', '#b77a43'], ['Brown', '#7a4a2a'],
  ['Dark Brown', '#4b2c1c'], ['Light Grey', '#d8d8d8'], ['Grey', '#9d9d9d'], ['Charcoal', '#545454'], ['Black', '#1b1b1b'],
]);

const PYSSLA = make('I', [
  ['White', '#f4f4f2'], ['Yellow', '#f6d32a'], ['Orange', '#ef7f22'], ['Red', '#d1283a'], ['Pink', '#f39cbf'],
  ['Purple', '#7a4c9f'], ['Light Blue', '#62b0e3'], ['Blue', '#2a5cb2'], ['Green', '#3a9b4c'], ['Light Green', '#9fd263'],
  ['Brown', '#6c432a'], ['Beige', '#e1c39d'], ['Grey', '#a0a0a0'], ['Black', '#262626'],
]);

export const PALETTES: Palette[] = [
  { id: 'mard', label: 'MARD', colors: MARD },
  { id: 'perler', label: 'Perler', colors: PERLER },
  { id: 'hama', label: 'Hama', colors: HAMA },
  { id: 'artkal', label: 'Artkal', colors: ARTKAL },
  { id: 'pyssla', label: 'IKEA Pyssla', colors: PYSSLA },
];

/** Special id meaning "derive colours from the photo itself" (k-means). */
export const AUTO_PALETTE_ID = 'auto';

/** Ids of user-made palettes start with this prefix. */
export const CUSTOM_PREFIX = 'custom-';

/** Looks up a built-in or user-made palette. */
export function getPalette(id: string, custom: Palette[] = []): Palette | undefined {
  return PALETTES.find((p) => p.id === id) ?? custom.find((p) => p.id === id);
}
