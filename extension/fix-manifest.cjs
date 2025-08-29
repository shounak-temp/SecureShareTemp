const fs = require('fs');
const distDir = './dist/assets';
const manifestPath = './dist/manifest.json';

const files = fs.readdirSync(distDir);
const findFile = (base) => files.find(f => f.startsWith(base.replace('.js', '')) && f.endsWith('.js'));

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

// Patch background
if (manifest.background && manifest.background.service_worker) {
  const bg = findFile('background.js');
  if (bg) manifest.background.service_worker = `assets/${bg}`;
}

// Patch content scripts
if (manifest.content_scripts) {
  manifest.content_scripts.forEach(cs => {
    if (cs.js) {
      cs.js = cs.js.map(js => {
        const hashed = findFile(js);
        return hashed ? `assets/${hashed}` : js;
      });
    }
  });
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Patched manifest.json with hashed filenames.');