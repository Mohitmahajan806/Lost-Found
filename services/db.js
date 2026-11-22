const path = require('path');
const fs = require('fs');
let sqlite3;
let hasSqlite = true;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  hasSqlite = false;
  console.warn('sqlite3 module not found — using in-memory fallback for captures. Install sqlite3 for persistence.');
}

const DB_PATH = path.join(__dirname, '..', 'data', 'captures.db');

function ensureDataDir() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

// In-memory fallback store
const MEM_STORE = new Map();

function init() {
  if (!hasSqlite) {
    return { memory: true };
  }

  ensureDataDir();
  const db = new sqlite3.Database(DB_PATH);

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      image_path TEXT,
      name TEXT,
      caption_short TEXT,
      caption_long TEXT,
      description TEXT,
      tags TEXT,
      entities TEXT,
      objects TEXT,
      colors TEXT,
      actions TEXT,
      location_clues TEXT,
      dimensions TEXT,
      safety_notes TEXT,
      confidence REAL,
      source TEXT
    )`);

    db.all(`PRAGMA table_info(captures)`, [], (err, columns) => {
      if (err) return;
      const hasNameColumn = Array.isArray(columns) && columns.some(col => col.name === 'name');
      if (!hasNameColumn) {
        db.run(`ALTER TABLE captures ADD COLUMN name TEXT`, (alterErr) => {
          if (alterErr) return;
          db.run(`UPDATE captures SET name = caption_short WHERE name IS NULL OR name = ''`, () => {});
        });
      }
    });

    // FTS5 virtual table for search (if available)
    try {
      db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(
        id, caption_short, caption_long, description, tags
      )`);
    } catch (e) {
      console.warn('FTS5 not available, continuing without full-text search.');
    }
  });

  return db;
}

function insertCapture(db, record) {
  return new Promise((resolve, reject) => {
    if (!hasSqlite) {
      MEM_STORE.set(record.id, record);
      return resolve(record);
    }
    const nameValue = record.name || record.caption_short || 'Untitled capture';

    const stmt = db.prepare(`INSERT INTO captures (
      id,timestamp,image_path,name,caption_short,caption_long,description,tags,entities,objects,colors,actions,location_clues,dimensions,safety_notes,confidence,source
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    stmt.run(
      record.id,
      record.timestamp,
      record.image_path,
      nameValue,
      record.caption_short || null,
      record.caption_long || null,
      record.description || null,
      JSON.stringify(record.tags || []),
      JSON.stringify(record.entities || []),
      JSON.stringify(record.objects || []),
      JSON.stringify(record.colors || []),
      JSON.stringify(record.actions || []),
      JSON.stringify(record.location_clues || []),
      JSON.stringify(record.dimensions || {}),
      JSON.stringify(record.safety_notes || []),
      record.confidence || 0,
      record.source || 'unknown',
      function (err) {
        if (err) return reject(err);

        // insert into FTS if exists
        try {
          db.run(`INSERT INTO captures_fts (id, caption_short, caption_long, description, tags) VALUES (?,?,?,?,?)`,
            [record.id, record.caption_short || '', record.caption_long || '', record.description || '', (record.tags||[]).join(' ')], (e) => {
              // ignore fts errors
              resolve(record);
            });
        } catch (e) {
          resolve(record);
        }
      }
    );

    stmt.finalize();
  });
}

function listCaptures(db, { page = 1, limit = 20, tag = null, sort = 'newest' } = {}) {
  const offset = (page - 1) * limit;
  const order = sort === 'newest' ? 'timestamp DESC' : 'timestamp ASC';
  return new Promise((resolve, reject) => {
    if (!hasSqlite) {
      const all = Array.from(MEM_STORE.values());
      let filtered = all;
      if (tag) filtered = filtered.filter(r => (r.tags || []).includes(tag));
      filtered.sort((a,b) => {
        if (order === 'timestamp DESC') return new Date(b.timestamp) - new Date(a.timestamp);
        return new Date(a.timestamp) - new Date(b.timestamp);
      });
      const pageItems = filtered.slice(offset, offset + limit).map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        image_path: r.image_path,
        caption_short: r.caption_short,
        confidence: r.confidence,
        tags: r.tags || []
      }));
      return resolve(pageItems);
    }
    let sql = `SELECT id,timestamp,image_path,name,caption_short,confidence,tags FROM captures`;
    const params = [];

    if (tag) {
      sql += ` WHERE tags LIKE ?`;
      params.push(`%${tag}%`);
    }

    sql += ` ORDER BY ${order} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      const items = rows.map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        image_path: r.image_path,
        name: r.name || r.caption_short || 'Untitled capture',
        caption_short: r.caption_short,
        confidence: r.confidence,
        tags: JSON.parse(r.tags || '[]')
      }));
      resolve(items);
    });
  });
}

function getCapture(db, id) {
  return new Promise((resolve, reject) => {
    if (!hasSqlite) {
      const row = MEM_STORE.get(id);
      if (!row) return resolve(null);
      const record = Object.assign({}, row);
      return resolve(record);
    }
    db.get(`SELECT * FROM captures WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      const record = {
        id: row.id,
        timestamp: row.timestamp,
        image_path: row.image_path,
        name: row.name || row.caption_short || 'Untitled capture',
        caption_short: row.caption_short,
        caption_long: row.caption_long,
        description: row.description,
        tags: JSON.parse(row.tags || '[]'),
        entities: JSON.parse(row.entities || '[]'),
        objects: JSON.parse(row.objects || '[]'),
        colors: JSON.parse(row.colors || '[]'),
        actions: JSON.parse(row.actions || '[]'),
        location_clues: JSON.parse(row.location_clues || '[]'),
        dimensions: JSON.parse(row.dimensions || '{}'),
        safety_notes: JSON.parse(row.safety_notes || '[]'),
        confidence: row.confidence,
        source: row.source
      };
      resolve(record);
    });
  });
}

function deleteCapture(db, id) {
  return new Promise((resolve, reject) => {
    if (!hasSqlite) {
      const row = MEM_STORE.get(id);
      if (!row) return resolve(false);
      const imgPath = path.join(__dirname, '..', row.image_path);
      fs.unlink(imgPath, (e) => {
        MEM_STORE.delete(id);
        resolve(true);
      });
      return;
    }
    db.get(`SELECT image_path FROM captures WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(false);
      const imgPath = path.join(__dirname, '..', row.image_path);
      fs.unlink(imgPath, (e) => {
        db.run(`DELETE FROM captures WHERE id = ?`, [id], function (err2) {
          if (err2) return reject(err2);
          try {
            db.run(`DELETE FROM captures_fts WHERE id = ?`, [id]);
          } catch (e) {}
          resolve(true);
        });
      });
    });
  });
}

function updateCapture(db, id, name) {
  return new Promise((resolve, reject) => {
    const cleanName = (name || '').trim();
    if (!hasSqlite) {
      const row = MEM_STORE.get(id);
      if (!row) return resolve(false);
      const nextName = cleanName || row.caption_short || 'Untitled capture';
      row.name = nextName;
      row.caption_short = nextName;
      MEM_STORE.set(id, row);
      return resolve(true);
    }

    db.run(`UPDATE captures SET name = ?, caption_short = ? WHERE id = ?`, [cleanName || null, cleanName || null, id], function (err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
}

function deleteAllCaptures(db) {
  return new Promise((resolve, reject) => {
    if (!hasSqlite) {
      MEM_STORE.clear();
      return resolve(true);
    }

    db.all(`SELECT id, image_path FROM captures`, [], (err, rows) => {
      if (err) return reject(err);

      const deleteActions = rows.map((row) => new Promise((done) => {
        const imgPath = path.join(__dirname, '..', row.image_path);
        fs.unlink(imgPath, () => done());
      }));

      Promise.all(deleteActions)
        .then(() => {
          db.run(`DELETE FROM captures`, [], function (err2) {
            if (err2) return reject(err2);
            try {
              db.run(`DELETE FROM captures_fts`);
            } catch (e) {}
            resolve(true);
          });
        })
        .catch(reject);
    });
  });
}

function searchCaptures(db, q, { page = 1, limit = 20, tag = null } = {}) {
  const offset = (page - 1) * limit;
  return new Promise((resolve, reject) => {
    if (!hasSqlite) {
      const all = Array.from(MEM_STORE.values());
      const lowered = (q || '').toLowerCase();
      const filtered = all.filter(r => {
        return (r.caption_short || '').toLowerCase().includes(lowered) || (r.caption_long || '').toLowerCase().includes(lowered) || (r.description || '').toLowerCase().includes(lowered);
      });
      const slice = filtered.slice(offset, offset + limit).map(r => ({ id: r.id, caption_short: r.caption_short }));
      return resolve(slice);
    }
    // use FTS if available
    db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name='captures_fts'`, [], (err, tables) => {
      if (err) return reject(err);
      if (tables && tables.length > 0) {
        const sql = `SELECT id, caption_short, snippet(captures_fts,1, '<b>','</b>','...',10) as snippet FROM captures_fts WHERE captures_fts MATCH ? LIMIT ? OFFSET ?`;
        db.all(sql, [q, limit, offset], (err2, rows) => {
          if (err2) return reject(err2);
          resolve(rows);
        });
      } else {
        // fallback simple LIKE search
        const sql = `SELECT id,caption_short FROM captures WHERE caption_short LIKE ? OR caption_long LIKE ? OR description LIKE ? LIMIT ? OFFSET ?`;
        const param = `%${q}%`;
        db.all(sql, [param, param, param, limit, offset], (err3, rows) => {
          if (err3) return reject(err3);
          resolve(rows);
        });
      }
    });
  });
}

module.exports = {
  init,
  insertCapture,
  listCaptures,
  getCapture,
  deleteCapture,
  updateCapture,
  deleteAllCaptures,
  searchCaptures
};
