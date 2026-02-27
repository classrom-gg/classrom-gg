/**
 * generate-games.js
 * Quét repo GitHub, tìm .html và .swf, tạo games.json
 *
 * Dùng: GITHUB_TOKEN=ghp_xxx node generate-games.js
 */

const https = require('https');
const fs = require('fs');

const OWNER  = process.env.GITHUB_OWNER  || 'classrom-gg';
const REPO   = process.env.GITHUB_REPO   || 'classrom-gg';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN  = process.env.GITHUB_TOKEN  || '';
const OUT    = process.env.OUTPUT_FILE   || 'games.json';

const CDN_BASE = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

function api(endpoint) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: endpoint,
      headers: {
        'User-Agent': 'classrom-gg-generator',
        'Accept': 'application/vnd.github.v3+json',
        ...(TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {})
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(d));
        else reject(new Error(`GitHub ${res.statusCode}: ${d.slice(0,200)}`));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function toName(filePath) {
  const parts = filePath.split('/');
  const raw = parts.length > 1
    ? parts[parts.length - 2]
    : parts[parts.length - 1].replace(/\.[^.]+$/, '');
  return raw.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function main() {
  if (!TOKEN) {
    console.error('❌ Cần GITHUB_TOKEN');
    console.error('   GITHUB_TOKEN=ghp_xxx node generate-games.js');
    process.exit(1);
  }

  console.log(`📡 Đang quét ${OWNER}/${REPO}@${BRANCH}...`);

  const branch = await api(`/repos/${OWNER}/${REPO}/branches/${BRANCH}`);
  const treeSha = branch.commit.commit.tree.sha;
  const tree = await api(`/repos/${OWNER}/${REPO}/git/trees/${treeSha}?recursive=1`);

  if (tree.truncated) console.warn('⚠️  Tree bị truncated, có thể thiếu file!');

  const files = tree.tree.filter(f => f.type === 'blob');
  const htmlFiles = files.filter(f => f.path.endsWith('.html'));
  const swfFiles  = files.filter(f => f.path.endsWith('.swf'));

  console.log(`✅ Tìm thấy: ${htmlFiles.length} HTML + ${swfFiles.length} SWF`);

  const games = [
    ...htmlFiles.map(f => ({ name: toName(f.path), type: 'html', path: f.path })),
    ...swfFiles.map(f  => ({ name: toName(f.path), type: 'swf',  path: f.path })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      repo: `${OWNER}/${REPO}`,
      branch: BRANCH,
      cdnBase: CDN_BASE,
      totalGames: games.length,
      htmlCount: htmlFiles.length,
      swfCount: swfFiles.length,
    },
    games
  };

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`\n🎉 Đã tạo ${OUT} — ${games.length} games`);
}

main();
