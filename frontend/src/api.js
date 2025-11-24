const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export async function fetchProducts(q='', category='') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  const res = await fetch(`${BASE}/api/products?${params.toString()}`);
  return res.json();
}
export async function searchProducts(name) {
  const res = await fetch(`${BASE}/api/products/search?name=${encodeURIComponent(name)}`);
  return res.json();
}
export async function updateProduct(id, data) {
  const res = await fetch(`${BASE}/api/products/${id}`, {
    method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  if (!res.ok) throw await res.json();
  return res.json();
}
export async function importCSV(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/api/products/import`, { method: 'POST', body: fd });
  return res.json();
}
export async function exportCSV() {
  const res = await fetch(`${BASE}/api/products/export`);
  const blob = await res.blob();
  return blob;
}
export async function getProductHistory(id) {
  const res = await fetch(`${BASE}/api/products/${id}/history`);
  return res.json();
}
export async function addProduct(data) {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  return res.json();
}