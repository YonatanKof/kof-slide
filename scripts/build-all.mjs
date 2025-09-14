#!/usr/bin/env node
// scripts/build-all.mjs
import { readdirSync, statSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SLIDES_DIR = join(ROOT, 'slides');
const DIST_DIR = join(ROOT, 'dist');

// Customize via env if you like: SLIDE_DECKS="deck1,deck2" or SKIP_DECKS="draft,old-*"
const ONLY = (process.env.SLIDE_DECKS ?? '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);
const SKIP = (process.env.SKIP_DECKS ?? '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

// Simple glob-ish matcher
const matches = (name, pattern) => {
	if (!pattern) return true;
	if (pattern.includes('*')) {
		const rx = new RegExp(
			'^' +
				pattern
					.split('*')
					.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
					.join('.*') +
				'$'
		);
		return rx.test(name);
	}
	return name === pattern;
};
const shouldSkip = (name) => SKIP.some((p) => matches(name, p));
const isOnly = (name) => ONLY.length === 0 || ONLY.some((p) => matches(name, p));

// Identify markdown entry file inside a deck
const findEntry = (deckPath) => {
	const candidates = ['slides.md', 'index.md', 'deck.md', 'presentation.md'];
	for (const c of candidates) {
		if (existsSync(join(deckPath, c))) return c;
	}
	// fallback: first .md file
	const md = readdirSync(deckPath).filter((f) => f.endsWith('.md'));
	return md[0] ?? null;
};

// Discover decks: any subfolder in /slides that contains a markdown entry
const discoverDecks = () => {
	if (!existsSync(SLIDES_DIR)) {
		console.error('No slides/ directory found.');
		process.exit(1);
	}
	const dirs = readdirSync(SLIDES_DIR).filter((name) => {
		const p = join(SLIDES_DIR, name);
		return (
			statSync(p).isDirectory() &&
			!name.startsWith('.') &&
			!name.startsWith('_') &&
			isOnly(name) &&
			!shouldSkip(name) &&
			findEntry(p) !== null
		);
	});
	return dirs.map((name) => ({
		name,
		path: join(SLIDES_DIR, name),
		entry: findEntry(join(SLIDES_DIR, name)),
	}));
};

const run = (cmd, args, cwd, extraEnv = {}) =>
	new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			stdio: 'inherit',
			cwd,
			shell: process.platform === 'win32',
			env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max_old_space_size=4096', ...extraEnv },
		});
		child.on('close', (code) =>
			code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} failed with ${code}`))
		);
	});

const buildDeck = async ({ name, path, entry }) => {
	const outDir = join(DIST_DIR, name);
	const base = `/${name}/`;
	console.log(`\n▶︎ Building deck: ${name}`);
	console.log(`   entry: ${entry}`);
	console.log(`   out:   ${outDir}`);
	console.log(`   base:  ${base}`);

	// Ensure dist/name exists (Slidev will create it, but mkdir in case)
	mkdirSync(outDir, { recursive: true });

	// Use npx slidev build with --base and --out
	await run('npx', ['-y', 'slidev', 'build', entry, '--base', base, '--out', outDir], path);
	console.log(`✓ Built ${name}`);
};

const generateIndex = (decks) => {
	mkdirSync(DIST_DIR, { recursive: true });

	const items = decks
		.map((d) => {
			// Try to extract a title from front-matter or first heading
			let title = d.name;
			try {
				const raw = readFileSync(join(d.path, d.entry), 'utf8');
				const fmTitle = raw.match(/^\s*title:\s*(.+)\s*$/m)?.[1]?.trim();
				const h1 = raw.match(/^#\s+(.+)$/m)?.[1]?.trim();
				title = fmTitle || h1 || d.name;
			} catch {}
			return `<li><a href="./${d.name}/">${title}</a></li>`;
		})
		.join('\n');

	const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Decks</title>
<style>
  body { font-family: system-ui; margin: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; }
  ul { display: grid; gap: .5rem; padding: 0; list-style: none; }
  a { text-decoration: none; padding: .75rem 1rem; border: 1px solid #ddd; border-radius: .75rem; display: block; }
  a:hover { background: #fafafa; }
</style>
<h1>Decks</h1>
<ul>
${items}
</ul>
</html>`;
	writeFileSync(join(DIST_DIR, 'index.html'), html);
	console.log('✓ Wrote dist/index.html');
};

(async () => {
	try {
		const decks = discoverDecks();
		if (decks.length === 0) {
			console.log('No decks found under slides/*');
			process.exit(0);
		}
		console.log(`Found ${decks.length} deck(s): ${decks.map((d) => d.name).join(', ')}`);

		// Clean build? leave to Netlify’s build image; otherwise you can rm -rf dist here.
		mkdirSync(DIST_DIR, { recursive: true });

		for (const deck of decks) {
			await buildDeck(deck);
		}

		generateIndex(decks);
		console.log('\n✅ All decks built.');
	} catch (err) {
		console.error('\n❌ Build failed:', err.message);
		process.exit(1);
	}
})();
