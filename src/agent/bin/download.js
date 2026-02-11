/**
 * Downloads cover images for seed documents into data/img/.
 * Uses placeholder images (picsum.photos) so the script works without API keys.
 * Replace img/*.jpg with real movie posters if desired.
 * Run from project root: node src/agent/data/download-posters.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedDocuments } from '../data/films.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.join(__dirname, 'img');
const WIDTH = 300;
const HEIGHT = 450;

if (!fs.existsSync(IMG_DIR)) {
    fs.mkdirSync(IMG_DIR, { recursive: true });
}

async function downloadImage(index) {
    const num = String(index).padStart(3, '0');
    const filename = `poster-${num}.jpg`;
    const filepath = path.join(IMG_DIR, filename);
    const url = `https://picsum.photos/seed/${index}/${WIDTH}/${HEIGHT}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filepath, buffer);
    return filename;
}

async function main() {
    const count = seedDocuments.length;
    console.log(`Downloading ${count} cover images to ${IMG_DIR}...`);
    for (let i = 1; i <= count; i++) {
        await downloadImage(i);
        console.log(`  ${i}/${count} img/poster-${String(i).padStart(3, '0')}.jpg`);
    }
    console.log('Done.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
