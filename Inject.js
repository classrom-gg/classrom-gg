/**
 * inject.js — Inject GLOBAL_HEAD vào các file HTML tĩnh
 * Chạy bởi GitHub Actions sau generate-games.js
 */
const fs = require('fs');

// Lấy GLOBAL_HEAD từ generate-games.js
const src = fs.readFileSync('generate-games.js', 'utf8');
const match = src.match(/const GLOBAL_HEAD\s*=\s*`([\s\S]*?)`;/);
const GLOBAL_HEAD = match ? match[1].trim() : '';

if (!GLOBAL_HEAD) {
  console.log('⚠️  GLOBAL_HEAD is empty, skipping inject');
  process.exit(0);
}

const FILES = ['index.html', 'game.html', 'privacy.html', 'terms.html', 'dmca.html', 'contact.html'];

fs.mkdirSync('_site', { recursive: true });

FILES.forEach(f => {
  if (!fs.existsSync(f)) return;
  let html = fs.readFileSync(f, 'utf8');
  html = html.replace('</head>', GLOBAL_HEAD + '\n</head>');
  fs.writeFileSync('_site/' + f, html);
  console.log('✅ injected:', f);
});