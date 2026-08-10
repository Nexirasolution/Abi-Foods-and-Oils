"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Modal from "@/components/Modal";
import MediaUploader from "@/components/MediaUploader";
import BulkUploadModal from "@/components/BulkUploadModal";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const EMPTY_FORM = {
  name: "",
  sku: "",
  category: "",
  price: "",
  compareAtPrice: "",
  unit: "gram",
  stock: 0,
  lowStockThreshold: 5,
  description: "",
  isFeatured: false,
  isActive: true,
  media: [],
};

const PAGE_SIZE = 20;

export default function AdminProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [exporting, setExporting] = useState(false);

  async function loadProducts() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/products?${params.toString()}`);
    const data = await res.json();
    setProducts(data.products || []);
    setPagination(data.pagination || null);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []));
  }, []);

  // Reset to page 1 whenever the search term changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  // Builds an SKU like AF-OIL-48213 from the category name + a short unique suffix.
  // Client-side generation is good enough for a low-volume admin panel, but if two
  // admins could add products for the same category at the exact same millisecond,
  // move this logic server-side (in the POST /api/products route) for guaranteed
  // uniqueness against the database.
  function generateSKU(categoryId) {
    const cat = categories.find((c) => c._id === categoryId);
    const catCode = cat
      ? cat.name.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X")
      : "GEN";
    const suffix = `${Date.now()}`.slice(-5) + Math.floor(Math.random() * 10);
    return `AF-${catCode}-${suffix}`;
  }

  function openAdd() {
    setEditingId(null);
    const defaultCategory = categories[0]?._id || "";
    setForm({
      ...EMPTY_FORM,
      category: defaultCategory,
      sku: generateSKU(defaultCategory),
    });
    setError("");
    setModalOpen(true);
  }

  function openEdit(p) {
    setEditingId(p._id);
    setForm({
      name: p.name,
      sku: p.sku || "",
      category: p.category?._id || "",
      price: p.price,
      compareAtPrice: p.compareAtPrice || "",
      unit: p.unit,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      description: p.description || "",
      isFeatured: p.isFeatured,
      isActive: p.isActive,
      media: p.media || [],
    });
    setError("");
    setModalOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        sku: form.sku.trim().toUpperCase(),
        price: Number(form.price),
        compareAtPrice: Number(form.compareAtPrice) || 0,
        stock: Number(form.stock),
        lowStockThreshold: Number(form.lowStockThreshold),
      };
      const res = await fetch(editingId ? `/api/products/${editingId}` : "/api/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save product.");
      setModalOpen(false);
      loadProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    // If this was the last item on the current page, step back a page
    if (products.length === 1 && page > 1) {
      setPage((p) => p - 1);
    } else {
      loadProducts();
    }
  }

  function goToPage(p) {
    if (p < 1 || (pagination && p > pagination.totalPages)) return;
    setPage(p);
  }

  const totalPages = pagination?.totalPages || 1;

  function getPageNumbers() {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== "...") {
        pages.push("...");
      }
    }
    return pages;
  }

  // --- Export helpers ---

  // Fetches every product matching the current search (no pagination limit)
  async function fetchAllProductsForExport() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    // omitting `page` and `limit` makes the API return the full unpaginated list
    const res = await fetch(`/api/products?${params.toString()}`);
    const data = await res.json();
    return data.products || [];
  }

  function buildExportRows(list) {
    return list.map((p) => ({
      SKU: p.sku,
      Name: p.name,
      Category: p.category?.name || "",
      Price: p.price,
      "Compare Price": p.compareAtPrice || 0,
      Unit: p.unit,
      Stock: p.stock,
      "Low Stock Threshold": p.lowStockThreshold,
      Status: p.isActive ? "Active" : "Hidden",
      Featured: p.isFeatured ? "Yes" : "No",
      Description: p.description || "",
    }));
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const list = await fetchAllProductsForExport();
      if (list.length === 0) {
        alert("No products to export.");
        return;
      }
      const rows = buildExportRows(list);
      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Reasonable column widths
      worksheet["!cols"] = [
        { wch: 14 }, // SKU
        { wch: 28 }, // Name
        { wch: 16 }, // Category
        { wch: 10 }, // Price
        { wch: 14 }, // Compare Price
        { wch: 10 }, // Unit
        { wch: 8 },  // Stock
        { wch: 10 }, // Low Stock Threshold
        { wch: 10 }, // Status
        { wch: 10 }, // Featured
        { wch: 40 }, // Description
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `products-${dateStr}.xlsx`);
    } catch (err) {
      console.error(err);
      alert("Failed to export Excel file.");
    } finally {
      setExporting(false);
    }
  }

  async function exportPDF() {
    setExporting(true);
    try {
      const list = await fetchAllProductsForExport();
      if (list.length === 0) {
        alert("No products to export.");
        return;
      }

      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(16);
      doc.setTextColor(30, 60, 45);
      doc.text("Abi Foods and Oils", pageWidth / 2, 16, { align: "center" });

      doc.setFontSize(12);
      doc.setTextColor(80, 80, 80);
      doc.text("Product List", pageWidth / 2, 23, { align: "center" });
      doc.setFontSize(9);
      doc.text(`Generated on ${new Date().toLocaleDateString("en-IN")} · ${list.length} products`, pageWidth / 2, 29, {
        align: "center",
      });

      autoTable(doc, {
        startY: 36,
        head: [["SKU", "Name", "Category", "Price (₹)", "Stock", "Status", "Featured"]],
        body: list.map((p) => [
          p.sku,
          p.name,
          p.category?.name || "-",
          p.price,
          p.stock,
          p.isActive ? "Active" : "Hidden",
          p.isFeatured ? "Yes" : "No",
        ]),
        theme: "grid",
        headStyles: { fillColor: [184, 146, 63] },
        styles: { fontSize: 8 },
        columnStyles: {
          1: { cellWidth: 70 }, // Name column gets more room
        },
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      doc.save(`products-${dateStr}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Failed to export PDF.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="font-body italic text-xl font-bold text-forest sm:text-2xl">Products</h1>
          <p className="mt-1 text-sm text-muted">
            {pagination ? `${pagination.total} products total` : "Loading..."}
          </p>
        </div>

        <input
          type="text"
          placeholder="Search by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-full border border-gold/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest sm:max-w-xs"
        />

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <button
            onClick={exportExcel}
            disabled={exporting}
            className="rounded-full border border-gold/40 px-4 py-2 text-xs font-semibold text-gold-dark hover:bg-gold/5 disabled:opacity-50 sm:px-5 sm:text-sm"
          >
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
          <button
            onClick={exportPDF}
            disabled={exporting}
            className="rounded-full border border-gold/40 px-4 py-2 text-xs font-semibold text-gold-dark hover:bg-gold/5 disabled:opacity-50 sm:px-5 sm:text-sm"
          >
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
          <button
            onClick={() => setBulkOpen(true)}
            disabled={categories.length === 0}
            className="rounded-full border border-forest px-4 py-2 text-xs font-semibold text-forest hover:bg-forest/5 disabled:opacity-50 sm:px-6 sm:text-sm"
            title={categories.length === 0 ? "Add a category first" : ""}
          >
            Bulk Upload
          </button>
          <button
            onClick={openAdd}
            disabled={categories.length === 0}
            className="rounded-full bg-forest px-4 py-2 text-xs font-semibold text-ivory shadow-soft hover:bg-forest-light disabled:opacity-50 sm:px-6 sm:text-sm"
            title={categories.length === 0 ? "Add a category first" : ""}
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* Desktop / tablet table */}
      <div className="mt-6 hidden overflow-x-auto rounded-xl2 border border-gold/15 bg-white shadow-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gold/15 bg-champagne/50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">
                {search ? "No products match your search." : "No products yet. Add your first product."}
              </td></tr>
            ) : (
              products.map((p) => (
                <tr key={p._id} className="border-b border-gold/10 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-ink/70">{p.sku}</td>
                  <td className="flex items-center gap-3 px-4 py-3">
                    <div className="h-10 w-10 overflow-hidden rounded-lg bg-champagne">
                     {p.media?.[0] &&
                        (p.media[0].type === "video" ? (
                          <video
                            src={p.media[0].url}
                            className="h-full w-full object-cover"
                            muted
                          />
                        ) : (
                          <Image
                            src={p.media[0].url}
                            alt=""
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        ))}
                    </div>
                    <span className="font-medium text-ink">{p.name}</span>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{p.category?.name}</td>
                  <td className="px-4 py-3 text-ink/70">₹{p.price}</td>
                  <td className="px-4 py-3">
                    <span className={p.stock <= p.lowStockThreshold ? "font-semibold text-terracotta" : "text-ink/70"}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${p.isActive ? "bg-forest/10 text-forest" : "bg-muted/10 text-muted"}`}>
                      {p.isActive ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(p)} className="mr-3 text-xs font-semibold text-forest hover:underline">Edit</button>
                    <button onClick={() => handleDelete(p._id)} className="text-xs font-semibold text-terracotta hover:underline">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="mt-6 space-y-3 md:hidden">
        {loading ? (
          <div className="rounded-xl2 border border-gold/15 bg-white p-6 text-center text-sm text-muted shadow-card">
            Loading...
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl2 border border-gold/15 bg-white p-6 text-center text-sm text-muted shadow-card">
            {search ? "No products match your search." : "No products yet. Add your first product."}
          </div>
        ) : (
          products.map((p) => (
            <div
              key={p._id}
              className="rounded-xl2 border border-gold/15 bg-white p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-champagne">
                  {p.media?.[0] &&
                    (p.media[0].type === "video" ? (
                      <video src={p.media[0].url} className="h-full w-full object-cover" muted />
                    ) : (
                      <Image
                        src={p.media[0].url}
                        alt=""
                        width={56}
                        height={56}
                        className="h-full w-full object-cover"
                      />
                    ))}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-medium text-ink">{p.name}</p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                        p.isActive ? "bg-forest/10 text-forest" : "bg-muted/10 text-muted"
                      }`}
                    >
                      {p.isActive ? "Active" : "Hidden"}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-ink/50">{p.sku}</p>
                  <p className="mt-0.5 text-xs text-ink/70">{p.category?.name}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-gold/10 pt-3">
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-semibold text-forest">₹{p.price}</span>
                  <span className={p.stock <= p.lowStockThreshold ? "font-semibold text-terracotta" : "text-ink/70"}>
                    Stock: {p.stock}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => openEdit(p)} className="text-xs font-semibold text-forest hover:underline">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(p._id)} className="text-xs font-semibold text-terracotta hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted">
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} products
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="rounded-full border border-gold/30 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-champagne disabled:cursor-not-allowed disabled:opacity-40"
            >
              &larr; Prev
            </button>

            {getPageNumbers().map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="px-2 text-xs text-muted">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => goToPage(p)}
                  className={`h-8 w-8 rounded-full text-xs font-semibold transition ${
                    p === page
                      ? "bg-forest text-ivory"
                      : "border border-gold/30 text-ink/70 hover:bg-champagne"
                  }`}
                >
                  {p}
                </button>
              )
            )}

            <button
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className="rounded-full border border-gold/30 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-champagne disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Product" : "Add Product"} wide>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Product Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink/70">SKU (auto-generated)</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={form.sku}
                  className="w-full cursor-not-allowed rounded-xl border border-gold/30 bg-champagne/40 px-4 py-2.5 text-sm text-ink/70 outline-none"
                />
                {!editingId && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, sku: generateSKU(f.category) }))}
                    className="shrink-0 rounded-xl border border-gold/30 px-3 py-2.5 text-xs font-semibold text-forest hover:bg-champagne"
                    title="Generate a new SKU"
                  >
                    ↻
                  </button>
                )}
              </div>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink/70">Category *</span>
            <select
              required
              value={form.category}
              onChange={(e) => {
                const categoryId = e.target.value;
                setForm((f) => ({
                  ...f,
                  category: categoryId,
                  // Re-generate the SKU whenever the category changes on a new
                  // product, so the SKU's category code always matches. Leave
                  // an existing product's SKU untouched while editing.
                  sku: editingId ? f.sku : generateSKU(categoryId),
                }));
              }}
              className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FormField label="Price (₹)" required type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
            <FormField label="Compare Price" type="number" value={form.compareAtPrice} onChange={(v) => setForm({ ...form, compareAtPrice: v })} />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink/70">Unit</span>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
              >
                <option value="gram">gram</option>
                <option value="kg">kg</option>
                <option value="piece">piece</option>
                <option value="ml">ml</option>
                <option value="litre">litre</option>
              </select>
            </label>
            <FormField label="Stock" required type="number" value={form.stock} onChange={(v) => setForm({ ...form, stock: v })} />
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink/70">Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink/70">Product Images / Videos</span>
              <MediaUploader
                media={form.media}
                onChange={(media) =>
                  setForm({
                    ...form,
                    media,
                  })
                }
              />          
              </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
              Featured on homepage
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active (visible in store)
            </label>
          </div>

          {error && <p className="text-sm text-terracotta">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-forest px-8 py-3 text-sm font-semibold text-ivory shadow-soft hover:bg-forest-light disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Save Changes" : "Add Product"}
          </button>
        </form>
      </Modal>

      <BulkUploadModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={loadProducts}
      />
    </div>
  );
}

function FormField({ label, value, onChange, required, type = "text", placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink/70">
        {label} {required && <span className="text-terracotta">*</span>}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
      />
    </label>
  );
}