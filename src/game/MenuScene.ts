import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../config/gameConfig';
import { CIRCLE_RADIUS, ensureTextures } from './textures';

/** Backdrop behind the menu screens: the arena with a few drifting motes. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    ensureTextures(this);
    this.add.image(0, 0, 'arena').setOrigin(0);
    const colors = [0x7df9ff, 0xff7b3a, 0xb48cff];
    for (let i = 0; i < 24; i++) {
      const mote = this.add
        .image(Phaser.Math.Between(0, ARENA_WIDTH), Phaser.Math.Between(0, ARENA_HEIGHT), 'circle')
        .setScale(Phaser.Math.FloatBetween(2, 6) / CIRCLE_RADIUS)
        .setTint(colors[i % colors.length])
        .setAlpha(0.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: mote,
        y: mote.y - Phaser.Math.Between(60, 200),
        alpha: 0,
        duration: Phaser.Math.Between(3000, 7000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 4000),
      });
    }
  }
}
