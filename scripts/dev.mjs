#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SLIDES_DIR = join(ROOT, 'slides');

const deckName = process.argv[2] || process.env.DECK;
if (!deckName) {
	console.error('❌ Please specify a deck name, e.g.: npm run dev -- this-name');
	process.exit(1);
}

const deckPath = join(SLIDES_DIR, deckName);
if (!existsSync(deckPath)) {
	console.error(`❌ Deck folder not found: ${deckPath}`);
	process.exit(1);
}

const candidates = ['slides.md', 'index.md', 'deck.md', 'presentation.md'];
let entry = candidates.find((f) => existsSync(join(deckPath, f)));

if (!entry) {
	const md = readdirSync(deckPath).find((f) => f.endsWith('.md'));
	if (!md) {
		console.error(`❌ No markdown entry file found in ${deckPath}`);
		process.exit(1);
	}
	entry = md;
}

console.log(`▶︎ Starting dev server for deck "${deckName}" (entry: ${entry})`);

const child = spawn('npx', ['-y', 'slidev', join(deckPath, entry)], {
	stdio: 'inherit',
	shell: process.platform === 'win32',
	cwd: ROOT,
	env: process.env,
});

child.on('close', (code) => process.exit(code));
