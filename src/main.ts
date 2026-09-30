import Phaser from 'phaser';

class MathMageScene extends Phaser.Scene {
  constructor() {
    super('MathMageScene');
  }

  preload() {
    // Phaser asset loading will go here
  }

  create() {
    // Display a test background and message
    this.cameras.main.setBackgroundColor('#1a1a2e');

    this.add.text(100, 100, 'Math Mage: Initiating Spellbooks!', {
      fontSize: '32px',
      color: '#00ffcc',
      fontStyle: 'bold'
    });

    console.log('Phaser Engine initialized.');
  }

  update() {
    // Game tick loop runs at 60fps (rendering)
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: true // Draws hitboxes during development
    }
  },
  scene: MathMageScene,
  parent: 'game-container'
};

new Phaser.Game(config);