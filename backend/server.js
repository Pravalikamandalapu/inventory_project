const express = require('express');
const multer = require('multer');
const { parse: csvParse } = require('csv-parse/sync');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { stringify } = require('csv-stringify/sync');
const { body, validationResult } = require('express-validator');
const cors = require('cors');

const app = express();
const upload = multer({ dest: 'tmp/' });
app.use(express.json());
app.use(cors());

const DB_FILE = process.env.DB_FILE || './data.db';
const db = new sqlite3.Database(DB_FILE);

const dbRun = (sql, params=[]) => new Promise((res, rej) => db.run(sql, params, function(err){
  if(err) rej(err); else res({ lastID: this.lastID, changes: this.changes });
}));
const dbAll = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (err, rows)=> err ? rej(err) : res(rows)));
const dbGet = (sql, params=[]) => new Promise((res, rej) => db.get(sql, params, (err, row)=> err ? rej(err) : res(row)));

async function init(){
  await dbRun(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    unit TEXT NOT NULL,
    category TEXT NOT NULL,
    brand TEXT,
    stock INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    old_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    changed_by TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);
}
init().catch(console.error);

app.get('/api/products', async (req, res) => {
  try {
    const { page = 1, limit = 100, sort = 'id', order = 'DESC', category, q } = req.query;
    const offset = (page-1) * limit;
    const where = [];
    const params = [];
    if (category) { where.push('category = ?'); params.push(category); }
    if (q) { where.push('name LIKE ?'); params.push('%' + q + '%'); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const sql = `SELECT * FROM products ${whereSql} ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`;
    const rows = await dbAll(sql, [...params, Number(limit), Number(offset)]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/products/search', async (req, res) => {
  try {
    const { name = '' } = req.query;
    const rows = await dbAll(`SELECT * FROM products WHERE name LIKE ? COLLATE NOCASE LIMIT 100`, [`%${name}%`]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/products/:id',
  body('name').notEmpty(),
  body('unit').notEmpty(),
  body('category').notEmpty(),
  body('stock').isInt({ min: 0 }),
  async (req, res) => {
    const id = Number(req.params.id);
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, unit, category, brand, stock, status, image, changedBy = 'admin' } = req.body;
    try {
      const row = await dbGet('SELECT id FROM products WHERE name = ? COLLATE NOCASE AND id != ?', [name, id]);
      if (row) return res.status(400).json({ error: 'Product name must be unique' });
      const current = await dbGet('SELECT * FROM products WHERE id = ?', [id]);
      if (!current) return res.status(404).json({ error: 'Not found' });
      await dbRun(`UPDATE products SET name=?, unit=?, category=?, brand=?, stock=?, status=?, image=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [name, unit, category, brand || null, Number(stock), status, image || null, id]);
      if (Number(stock) !== Number(current.stock)) {
        await dbRun(`INSERT INTO inventory_logs (product_id, old_stock, new_stock, changed_by) VALUES (?, ?, ?, ?)`,
          [id, Number(current.stock), Number(stock), changedBy]);
      }
      const updated = await dbGet('SELECT * FROM products WHERE id = ?', [id]);
      res.json(updated);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/products/:id/history', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await dbAll(`SELECT id, product_id, old_stock, new_stock, changed_by, timestamp FROM inventory_logs WHERE product_id = ? ORDER BY timestamp DESC`, [id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/products/import', upload.single('file'), async (req, res) => {
  const filePath = req.file?.path;
  if (!filePath) return res.status(400).json({ error: 'CSV file required (field "file")' });
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    fs.unlinkSync(filePath);
    const records = csvParse(content, { columns: true, skip_empty_lines: true, trim: true });
    let added = 0, skipped = 0;
    const duplicates = [];
    for (const rec of records) {
      const name = (rec.name || '').trim();
      if (!name) { skipped++; continue; }
      const existing = await dbGet('SELECT id FROM products WHERE name = ? COLLATE NOCASE', [name]);
      if (existing) { duplicates.push({ name, existingId: existing.id }); skipped++; continue; }
      const stockVal = Number(rec.stock || 0);
      const status = rec.status || (stockVal > 0 ? 'In Stock' : 'Out of Stock');
      await dbRun(`INSERT INTO products (name, unit, category, brand, stock, status, image) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, rec.unit || 'pcs', rec.category || 'Uncategorized', rec.brand || null, stockVal, status, rec.image || null]);
      added++;
    }
    res.json({ added, skipped, duplicates });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Invalid CSV or server error' });
  }
});

app.get('/api/products/export', async (req, res) => {
  try {
    const rows = await dbAll('SELECT name, unit, category, brand, stock, status, image FROM products');
    const header = ['name','unit','category','brand','stock','status','image'];
    const csvContent = stringify(rows, { header: true, columns: header });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products_export.csv"');
    res.send(csvContent);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/products',
  body('name').notEmpty(),
  body('unit').notEmpty(),
  body('category').notEmpty(),
  body('stock').isInt({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, unit, category, brand, stock=0, status, image } = req.body;
    try {
      const existing = await dbGet('SELECT id FROM products WHERE name = ? COLLATE NOCASE', [name]);
      if (existing) return res.status(400).json({ error: 'Product already exists' });
      const st = status || (Number(stock) > 0 ? 'In Stock' : 'Out of Stock');
      const r = await dbRun(`INSERT INTO products (name, unit, category, brand, stock, status, image) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, unit, category, brand || null, Number(stock), st, image || null]);
      const inserted = await dbGet('SELECT * FROM products WHERE id = ?', [r.lastID]);
      res.status(201).json(inserted);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));