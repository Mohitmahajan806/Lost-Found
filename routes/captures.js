const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
let uuidv4;
try {
  uuidv4 = require('uuid').v4;
} catch (e) {
  uuidv4 = function () {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };
}

let fetchFn = null;
if (global.fetch) fetchFn = global.fetch;
else {
  try {
    fetchFn = require('node-fetch');
  } catch (e) {
    // simple fallback for local HTTP POSTs using http/https
    const http = require('http');
    const https = require('https');
    fetchFn = function (url, opts = {}) {
      return new Promise((resolve, reject) => {
        try {
          const u = new URL(url);
          const lib = u.protocol === 'https:' ? https : http;
          const body = opts.body || null;
          const headers = opts.headers || {};
          const req = lib.request(u, { method: opts.method || 'GET', headers }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => JSON.parse(data), text: async () => data });
            });
          });
          req.on('error', reject);
          if (body) req.write(body);
          req.end();
        } catch (err) { reject(err); }
      });
    };
  }
}
const fetch = fetchFn;
const dbService = require('../services/db');
const { extractJSON } = require('../utils/aiParser');

function isValidDataURL(dataURL) {
  if (typeof dataURL !== 'string') return false;
  if (!dataURL.startsWith('data:')) return false;
  // very small images are invalid
  if (dataURL.length < 200) return false;
  return true;
}

module.exports = function (app, db) {
  // serve captures folder statically
  app.use('/captures', express.static(path.join(__dirname, '..', 'captures')));

  router.post('/', async (req, res) => {
    try {
      const image = req.body?.image;
      if (!isValidDataURL(image)) {
        return res.status(400).json({ success: false, description: 'Invalid image data' });
      }

      // basic size limit check (base64 length)
      if (image.length > 5 * 1024 * 1024) {
        return res.status(413).json({ success: false, description: 'Image too large' });
      }

      // extract mime and base64
      const match = image.match(/^data:(image\/[^;]+);base64,(.*)$/);
      if (!match) {
        return res.status(400).json({ success: false, description: 'Invalid data URL format' });
      }

      const mime = match[1];
      const b64 = match[2];
      const ext = mime.split('/')[1].split('+')[0];
      const id = uuidv4();
      const filename = `captures/${id}.${ext}`;
      const filepath = path.join(__dirname, '..', filename);

      // save file
      const buffer = Buffer.from(b64, 'base64');
      fs.writeFileSync(filepath, buffer);

      // call local analyze endpoint (server's own /analyze)
      const serverPort = req.app.get('port') || process.env.PORT || 3000;
      const analyzeUrl = `http://127.0.0.1:${serverPort}/analyze`;

      let aiResponse = null;
      try {
        const r = await fetch(analyzeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image })
        });
        aiResponse = await r.json();
      } catch (e) {
        aiResponse = null;
      }

      // parse structured if available
      let structured = null;
      if (aiResponse && aiResponse.structured) {
        structured = aiResponse.structured;
      } else if (aiResponse && typeof aiResponse.description === 'string') {
        // try to extract JSON from description
        structured = extractJSON(aiResponse.description);
      }

      // prepare record
      const rec = {
        id,
        timestamp: new Date().toISOString(),
        image_path: filename,
        caption_short: structured?.caption_short || null,
        caption_long: structured?.caption_long || aiResponse?.description || null,
        description: aiResponse?.description || (structured ? JSON.stringify(structured) : null),
        tags: structured?.tags || [],
        entities: structured?.entities || [],
        objects: structured?.objects || [],
        colors: structured?.colors || [],
        actions: structured?.actions || [],
        location_clues: structured?.location_clues || [],
        dimensions: structured?.dimensions || { width: null, height: null },
        safety_notes: structured?.safety_notes || [],
        confidence: structured?.confidence || 0,
        source: aiResponse?.mode || 'mock'
      };

      await dbService.insertCapture(db, rec);

      const result = Object.assign({}, rec, { imageUrl: `/${filename}` });

      return res.json({ success: true, capture: result });
    } catch (error) {
      console.error('Capture save error', error);
      return res.status(500).json({ success: false, description: 'Failed to save capture' });
    }
  });

  router.put('/:id', async (req, res) => {
    const id = req.params.id;
    const name = String(req.body?.name || req.body?.title || '').trim();

    try {
      const ok = await dbService.updateCapture(db, id, name);
      if (!ok) return res.status(404).json({ success: false, description: 'Not found' });
      return res.json({ success: true, name });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, description: 'Failed to update capture name' });
    }
  });

  router.get('/', async (req, res) => {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '20');
    const tag = req.query.tag || null;
    const sort = req.query.sort || 'newest';
    try {
      const items = await dbService.listCaptures(db, { page, limit, tag, sort });
      return res.json({ success: true, captures: items });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, description: 'Failed to list captures' });
    }
  });

  router.get('/search', async (req, res) => {
    const q = req.query.q || '';
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '20');
    try {
      const items = await dbService.searchCaptures(db, q, { page, limit });
      return res.json({ success: true, results: items });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, description: 'Search failed' });
    }
  });

  router.delete('/all', async (req, res) => {
    try {
      await dbService.deleteAllCaptures(db);
      return res.json({ success: true, deleted: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, description: 'Failed to delete all captures' });
    }
  });

  router.get('/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const rec = await dbService.getCapture(db, id);
      if (!rec) return res.status(404).json({ success: false, description: 'Not found' });
      rec.imageUrl = `/${rec.image_path}`;
      return res.json({ success: true, capture: rec });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, description: 'Failed to get capture' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const ok = await dbService.deleteCapture(db, id);
      if (!ok) return res.status(404).json({ success: false, description: 'Not found' });
      return res.json({ success: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, description: 'Delete failed' });
    }
  });

  app.use('/captures-api', router);
};
