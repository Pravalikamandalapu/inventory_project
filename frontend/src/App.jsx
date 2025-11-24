import React, { useEffect, useState, useRef } from 'react';
import * as api from './api';

function Header({ onSearch, onImportClick, onExportClick, onAddClick, categories, category, setCategory }) {
  return (
    <div className="header">
      <div className="left">
        <input placeholder="Search products..." onChange={e => onSearch(e.target.value)} />
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="right">
        <button onClick={onAddClick}>Add New Product</button>
        <button onClick={onImportClick}>Import</button>
        <button onClick={onExportClick}>Export</button>
      </div>
    </div>
  );
}

function ProductRow({ p, onEditClick, onSelect }) {
  return (
    <tr onClick={() => onSelect(p)}>
      <td><img src={p.image || 'https://via.placeholder.com/40'} alt="" width="40" /></td>
      <td>{p.name}</td>
      <td>{p.unit}</td>
      <td>{p.category}</td>
      <td>{p.brand}</td>
      <td>{p.stock}</td>
      <td><span className={p.status === 'In Stock' ? 'badge green' : 'badge red'}>{p.status}</span></td>
      <td>
        <button onClick={(e)=>{ e.stopPropagation(); onEditClick(p); }}>Edit</button>
      </td>
    </tr>
  )
}

function InlineEdit({ product, onSave, onCancel }) {
  const [form, setForm] = useState({...product});
  return (
    <tr>
      <td><img src={form.image || 'https://via.placeholder.com/40'} alt="" width="40" /></td>
      <td><input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} /></td>
      <td><input value={form.unit} onChange={e=>setForm({...form, unit: e.target.value})} /></td>
      <td><input value={form.category} onChange={e=>setForm({...form, category: e.target.value})} /></td>
      <td><input value={form.brand || ''} onChange={e=>setForm({...form, brand: e.target.value})} /></td>
      <td><input type="number" value={form.stock} onChange={e=>setForm({...form, stock: Number(e.target.value)})} /></td>
      <td>
        <select value={form.status} onChange={e=>setForm({...form, status: e.target.value})}>
          <option>In Stock</option>
          <option>Out of Stock</option>
        </select>
      </td>
      <td>
        <button onClick={()=>onSave(form)}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </td>
    </tr>
  )
}

function HistoryPanel({ product, onClose }) {
  const [logs, setLogs] = useState([]);
  useEffect(()=> {
    if (!product) return;
    api.getProductHistory(product.id).then(setLogs).catch(console.error);
  }, [product]);
  if (!product) return null;
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>History: {product.name}</h3>
        <button onClick={onClose}>Close</button>
      </div>
      <table className="history-table">
        <thead><tr><th>Date</th><th>Old</th><th>New</th><th>By</th></tr></thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id}>
              <td>{new Date(l.timestamp).toLocaleString()}</td>
              <td>{l.old_stock}</td>
              <td>{l.new_stock}</td>
              <td>{l.changed_by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function App(){
  const [products, setProducts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const fileRef = useRef();

  useEffect(()=> { load(); }, []);

  async function load(q='') {
    const rows = await api.fetchProducts(q, category);
    setProducts(rows);
    const cats = Array.from(new Set(rows.map(r => r.category))).filter(Boolean);
    setCategories(cats);
  }

  function handleSearch(q) {
    if (this._t) clearTimeout(this._t);
    this._t = setTimeout(()=> load(q), 300);
  }

  function handleImportClick() {
    fileRef.current.click();
  }

  async function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const res = await api.importCSV(f);
    alert(`Import done: added=${res.added}, skipped=${res.skipped}`);
    load();
  }

  async function handleExport() {
    const blob = await api.exportCSV();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSave(form) {
    try {
      const updated = await api.updateProduct(form.id, form);
      setProducts(ps => ps.map(p => p.id === updated.id ? updated : p));
      setEditingId(null);
      alert('Saved');
    } catch (err) {
      alert('Error saving: ' + JSON.stringify(err));
    }
  }

  return (
    <div className="app">
      <Header onSearch={handleSearch.bind({})} onImportClick={handleImportClick} onExportClick={handleExport}
        onAddClick={()=>{ const name = prompt('Product name'); if (!name) return; api.addProduct({ name, unit:'pcs', category:'Misc', stock:0 }).then(()=>load()); }}
        categories={categories} category={category} setCategory={setCategory} />
      <input type="file" ref={fileRef} style={{ display:'none' }} accept=".csv" onChange={handleFile} />
      <table className="product-table">
        <thead><tr><th>Image</th><th>Name</th><th>Unit</th><th>Category</th><th>Brand</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {products.map(p => editingId === p.id ? (
            <InlineEdit key={p.id} product={p} onSave={handleSave} onCancel={()=>setEditingId(null)} />
          ) : (
            <ProductRow key={p.id} p={p} onEditClick={()=>setEditingId(p.id)} onSelect={(prod)=>setSelected(prod)} />
          ))}
        </tbody>
      </table>

      <HistoryPanel product={selected} onClose={()=>setSelected(null)} />
    </div>
  )
}