import React, { useMemo, useState } from "react";
import { Database, HardDrive, Layers, RefreshCw, Search } from "lucide-react";
import { useCart } from "../context/CartContext";
import ProductCard from "./ProductCard";

export default function ProductCatalog({ products, loading, onRefresh, onNotify }) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const { items: cartItems, addItem } = useCart();

  const categories = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort();
    return ["Todas", ...unique];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "Todas" || product.category === selectedCategory;
      const matchesSearch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.description.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  const cartQtyById = useMemo(() => {
    const map = {};
    for (const item of cartItems) {
      map[item.product_id] = item.quantity;
    }
    return map;
  }, [cartItems]);

  const handleAdd = (product) => {
    addItem(product);
    onNotify?.(`"${product.name}" añadido al carrito.`);
  };

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-6 py-8 text-white shadow-lg sm:px-10 sm:py-10">
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-200">
              <Layers className="h-3.5 w-3.5" />
              Arquitectura Cloud-Native en LocalStack
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">
              Catálogo Tecnológico CloudStore
            </h1>
            <p className="text-sm text-slate-300 sm:text-base">
              Productos consultados en tiempo real desde{" "}
              <strong className="text-white">Amazon DynamoDB</strong>, avatares alojados en{" "}
              <strong className="text-white">S3 local</strong> y pedidos despachados de forma
              asíncrona hacia <strong className="text-white">SQS orders-queue</strong>.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[320px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
              <Database className="mx-auto h-5 w-5 text-cyan-400" />
              <span className="mt-1 block text-xs font-semibold text-white">DynamoDB</span>
              <span className="text-[11px] text-slate-400">3 Tablas</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
              <HardDrive className="mx-auto h-5 w-5 text-emerald-400" />
              <span className="mt-1 block text-xs font-semibold text-white">Amazon S3</span>
              <span className="text-[11px] text-slate-400">Avatares</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
              <Layers className="mx-auto h-5 w-5 text-amber-400" />
              <span className="mt-1 block text-xs font-semibold text-white">Amazon SQS</span>
              <span className="text-[11px] text-slate-400">Cola Pedidos</span>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Category Filters */}
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar laptops, monitores, periféricos..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                selectedCategory === category
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              {category}
            </button>
          ))}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            title="Recargar catálogo desde DynamoDB"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </section>

      {/* Grid */}
      {loading && products.length === 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="h-44 rounded-xl bg-slate-200" />
              <div className="mt-4 h-4 w-2/3 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-full rounded bg-slate-100" />
              <div className="mt-6 h-8 w-1/2 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-base font-semibold text-slate-700">
            No se encontraron productos con los filtros actuales.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSelectedCategory("Todas");
            }}
            className="mt-3 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.product_id}
              product={product}
              quantityInCart={cartQtyById[product.product_id] || 0}
              onAddToCart={handleAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
}
