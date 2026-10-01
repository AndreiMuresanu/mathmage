import { defineConfig } from 'vite';


export default defineConfig({
	base: '/mathmage/', // Crucial for hosting in a GitHub subfolder
	server: {
		port: 3000,
		open: true // Automatically opens the game in your browser on run
	}
});