import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../config/gameConfig';

/** Radius of the generated white circle texture; scale images by radius / CIRCLE_RADIUS. */
export const CIRCLE_RADIUS = 32;

/**
 * Generate the placeholder textures once (Graphics is costly to redraw every frame, so we bake
 * shapes into textures and draw them as tinted Images).
 */
export function ensureTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('circle')) return;
  const g = scene.make.graphics({}, false);

  g.fillStyle(0xffffff, 1).fillCircle(CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS);
  g.generateTexture('circle', CIRCLE_RADIUS * 2, CIRCLE_RADIUS * 2);
  g.clear();

  g.lineStyle(4, 0xffffff, 1).strokeCircle(CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS - 2);
  g.generateTexture('ring', CIRCLE_RADIUS * 2, CIRCLE_RADIUS * 2);
  g.clear();

  // Arena floor: dark background with a faint grid and a glowing border.
  g.fillStyle(0x141428, 1).fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
  g.lineStyle(1, 0x2a2a4a, 1);
  for (let x = 0; x <= ARENA_WIDTH; x += 64) g.lineBetween(x, 0, x, ARENA_HEIGHT);
  for (let y = 0; y <= ARENA_HEIGHT; y += 64) g.lineBetween(0, y, ARENA_WIDTH, y);
  g.lineStyle(4, 0x00ffcc, 0.5).strokeRect(2, 2, ARENA_WIDTH - 4, ARENA_HEIGHT - 4);
  g.generateTexture('arena', ARENA_WIDTH, ARENA_HEIGHT);
  g.destroy();
}

export function colorToInt(css: string): number {
  return Phaser.Display.Color.HexStringToColor(css).color;
}
