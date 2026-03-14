const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5';
const ANTHROPIC_VERSION = '2023-06-01';
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(payload);
}

function normalizeString(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || '';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function buildSystemPrompt() {
  return [
    'You write concise game catalog copy for a browser game website.',
    'Return valid JSON only. Do not use Markdown fences.',
    'JSON schema:',
    '{"description":"string","controls":"string","instructions":"string","creator":"string","developer":"string","tips":["string"]}',
    'Rules:',
    '- Base your output only on the provided metadata and notes.',
    '- Do not invent mechanics, controls, or developer names when uncertain.',
    '- Leave developer as an empty string if it is unknown.',
    '- Keep description to 2 or 3 sentences.',
    '- Keep controls compact and separated by newline characters when there are multiple actions.',
    '- Keep instructions to 2 short coaching sentences separated by newline characters.',
    '- Keep creator as 1 short sentence or paragraph.',
    '- Return exactly 3 tips when enough information exists, otherwise return the best safe tips you can derive from the provided notes.',
  ].join('\n');
}

function buildUserPrompt(payload) {
  const input = {
    game: {
      name: normalizeString(payload?.game?.name),
      slug: normalizeString(payload?.game?.slug),
      type: normalizeString(payload?.game?.type),
      url: normalizeString(payload?.game?.url),
      thumb: normalizeString(payload?.game?.thumb),
      category: normalizeString(payload?.game?.category),
    },
    existing: {
      description: normalizeString(payload?.existing?.description),
      controls: normalizeString(payload?.existing?.controls),
      instructions: normalizeString(payload?.existing?.instructions),
      creator: normalizeString(payload?.existing?.creator),
      developer: normalizeString(payload?.existing?.developer),
      tips: Array.isArray(payload?.existing?.tips) ? payload.existing.tips.map((item) => normalizeString(item)).filter(Boolean) : [],
    },
    notes: normalizeString(payload?.notes),
  };

  return [
    'Generate the JSON content for this game entry.',
    'Use the existing content only when it helps preserve valid facts.',
    'Input:',
    JSON.stringify(input, null, 2),
  ].join('\n\n');
}

function extractClaudeText(data) {
  if (!Array.isArray(data?.content)) return '';
  return data.content
    .filter((item) => item && item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
    .trim();
}

function parseJsonBlock(text) {
  const trimmed = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('Claude response was not valid JSON.');
  }
}

function sanitizeTips(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean).slice(0, 5);
}

function sanitizeContent(value) {
  const data = value && typeof value === 'object' ? value : {};
  return {
    description: normalizeString(data.description),
    controls: normalizeString(data.controls),
    instructions: normalizeString(data.instructions),
    creator: normalizeString(data.creator),
    developer: normalizeString(data.developer),
    tips: sanitizeTips(data.tips),
  };
}

function resolveStaticPath(urlPath) {
  const pathname = decodeURIComponent(String(urlPath || '').split('?')[0]);
  const relativePath = pathname === '/' ? 'dashboard.html' : pathname.replace(/^\/+/, '');
  if (!relativePath) return null;

  const resolved = path.resolve(ROOT_DIR, relativePath);
  const relative = path.relative(ROOT_DIR, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

async function tryServeStatic(req, res) {
  let filePath = resolveStaticPath(req.url);
  if (!filePath) return false;

  try {
    let stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stats = await fs.promises.stat(filePath);
    }

    if (!stats.isFile()) return false;

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch (error) {
    return false;
  }
}

async function requestClaude(payload) {
  const model = normalizeString(payload?.model) || DEFAULT_MODEL;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(payload) }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || ('Claude API returned HTTP ' + response.status));
  }

  const text = extractClaudeText(data);
  const parsed = parseJsonBlock(text);
  return { model, content: sanitizeContent(parsed) };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      port: PORT,
      hasApiKey: Boolean(CLAUDE_API_KEY),
      defaultModel: DEFAULT_MODEL,
      dashboardUrl: 'http://localhost:' + PORT + '/dashboard.html',
    });
    return;
  }

  if (req.url !== '/api/claude-content' || req.method !== 'POST') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const served = await tryServeStatic(req, res);
      if (served) return;
    }
    sendText(res, 404, 'Not found. Use /dashboard.html for the admin page, /health for health, or /api/claude-content for Claude content generation.');
    return;
  }

  if (!CLAUDE_API_KEY) {
    sendJson(res, 500, {
      ok: false,
      error: 'CLAUDE_API_KEY is not set. Start this proxy with your Anthropic key in the environment.',
    });
    return;
  }

  try {
    const rawBody = await readBody(req);
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const result = await requestClaude(payload);
    sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log('Claude proxy listening on http://localhost:' + PORT);
  console.log('Health check: http://localhost:' + PORT + '/health');
  console.log('Dashboard: http://localhost:' + PORT + '/dashboard.html');
});