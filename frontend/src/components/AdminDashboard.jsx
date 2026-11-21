import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Database,
  DollarSign,
  Edit3,
  Layers,
  Loader2,
  Package,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api/client";

const PRODUCT_ICON_OPTIONS = [
  { label: "Laptop Pro", value: "/products/laptop-pro.svg" },
  { label: "Audífonos ANC", value: "/products/headphones-anc.svg" },
  { label: "Teclado Mecánico", value: "/products/keyboard-mech.svg" },
  { label: "Mouse Ergonómico", value: "/products/mouse-ergo.svg" },
  { label: "Monitor 4K", value: "/products/monitor-4k.svg" },
  { label: "Webcam 4K", value: "/products/webcam-hd.svg" },
  { label: "Hub USB-C", value: "/products/dock-usbc.svg" },
  { label: "SSD NVMe 2TB", value: "/products/ssd-nvme.svg" },
  { label: "Altavoz Hi-Fi", value: "/products/speaker-smart.svg" },
  { label: "Silla Ergonómica", value: "/products/chair-ergo.svg" },
];

const EMPTY_PRODUCT_FORM = {
  name: "",
  description: "",
  price: "",
  stock: "",
  category: "Periféricos",
  image_url: "/products/laptop-pro.svg",
};

export default function AdminDashboard({ products, onCatalogChanged, onNotify }) {
  const [metrics, setMetrics] = useState(null);
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("orders");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [processingSqs, setProcessingSqs] = useState(false);
  const [lastWorkerResult, setLastWorkerResult] = useState(null);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM);
  const [savingProduct, setSavingProduct] = useState(false);

  const loadDashboardData = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const [sqsData, ordersData] = await Promise.all([
        api.getSqsMetrics(),
        api.getAllOrders(statusFilter),
      ]);
      setMetrics(sqsData);
      setOrders(ordersData);
    } catch (err) {
      onNotify?.(err.message || "Error consultando métricas de administración.", "error");
    } finally {
      setLoadingMetrics(false);
    }
  }, [statusFilter, onNotify]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const intervalId = setInterval(loadDashboardData, 5000);
    return () => clearInterval(intervalId);
  }, [autoRefresh, loadDashboardData]);

  const handleProcessBatch = async (batchLimit = 10) => {
    setProcessingSqs(true);
    try {
      const result = await api.processSqsOrders(batchLimit);
      setLastWorkerResult(result);
      onNotify?.(result.message);
      await loadDashboardData();
    } catch (err) {
      onNotify?.(err.message || "Error procesando cola SQS.", "error");
    } finally {
      setProcessingSqs(false);
    }
  };

  const handleProcessAllQueue = async () => {
    setProcessingSqs(true);
    let totalProcessed = 0;
    let allIds = [];
    let remaining = metrics?.approximate_number_of_messages ?? 0;

    try {
      for (let round = 0; round < 20; round += 1) {
        const res = await api.processSqsOrders(100);
        totalProcessed += res.processed_count;
        allIds = allIds.concat(res.processed_order_ids);
        remaining = res.remaining_approximate_messages;
        if (res.processed_count === 0 || remaining === 0) break;
      }
      const summary = {
        processed_count: totalProcessed,
        processed_order_ids: allIds,
        remaining_approximate_messages: remaining,
        message:
          totalProcessed > 0
            ? `Worker completado: ${totalProcessed} pedido(s) procesados desde SQS y actualizados a PROCESSED.`
            : "La cola SQS ya se encontraba vacía.",
      };
      setLastWorkerResult(summary);
      onNotify?.(summary.message);
      await loadDashboardData();
    } catch (err) {
      onNotify?.(err.message || "Error drenando cola SQS.", "error");
    } finally {
      setProcessingSqs(false);
    }
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setProductForm(EMPTY_PRODUCT_FORM);
    setProductModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description,
      price: String(product.price),
      stock: String(product.stock),
      category: product.category,
      image_url: product.image_url || "/products/laptop-pro.svg",
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setSavingProduct(true);
    const payload = {
      name: productForm.name.trim(),
      description: productForm.description.trim(),
      price: Number(productForm.price),
      stock: Number(productForm.stock),
      category: productForm.category.trim(),
      image_url: productForm.image_url.trim() || "/products/laptop-pro.svg",
    };

    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.product_id, payload);
        onNotify?.(`Producto "${payload.name}" actualizado en DynamoDB.`);
      } else {
        await api.createProduct(payload);
        onNotify?.(`Producto "${payload.name}" creado en DynamoDB.`);
      }
      setProductModalOpen(false);
      await onCatalogChanged?.();
    } catch (err) {
      onNotify?.(err.message || "No se pudo guardar el producto.", "error");
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`¿Eliminar "${product.name}" de DynamoDB?`)) return;
    try {
      await api.deleteProduct(product.product_id);
      onNotify?.(`Producto "${product.name}" eliminado.`);
      await onCatalogChanged?.();
    } catch (err) {
      onNotify?.(err.message || "Error al eliminar el producto.", "error");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header + SQS Controls */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            <Activity className="h-3.5 w-3.5" />
            Consola Operativa AWS LocalStack
          </span>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
            Panel de Administración
          </h1>
          <p className="text-sm text-slate-500">
            Monitorea la cola SQS <code>orders-queue</code>, procesa pedidos hacia DynamoDB y
            administra el catálogo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Auto-refresco (5s)
          </label>

          <button
            type="button"
            onClick={loadDashboardData}
            disabled={loadingMetrics}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingMetrics ? "animate-spin" : ""}`} />
            Actualizar
          </button>

          <button
            type="button"
            onClick={() => handleProcessBatch(10)}
            disabled={processingSqs}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-60"
          >
            {processingSqs ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Procesar Lote (10)
          </button>

          <button
            type="button"
            onClick={handleProcessAllQueue}
            disabled={processingSqs}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            <Layers className="h-3.5 w-3.5" />
            Procesar Toda la Cola
          </button>
        </div>
      </div>

      {/* Worker execution feedback */}
      {lastWorkerResult && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold">{lastWorkerResult.message}</p>
              {lastWorkerResult.processed_order_ids?.length > 0 && (
                <p className="mt-1 text-xs text-emerald-700">
                  Últimos IDs procesados:{" "}
                  <code>{lastWorkerResult.processed_order_ids.slice(0, 5).join(", ")}</code>
                  {lastWorkerResult.processed_order_ids.length > 5
                    ? ` (+${lastWorkerResult.processed_order_ids.length - 5} más)`
                    : ""}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLastWorkerResult(null)}
            className="self-end text-xs font-semibold text-emerald-700 hover:underline sm:self-center"
          >
            Ocultar
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>SQS Visibles</span>
            <Layers className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">
            {metrics ? metrics.approximate_number_of_messages : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">ApproximateNumberOfMessages</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>SQS En Vuelo</span>
            <Activity className="h-4 w-4 text-cyan-600" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">
            {metrics ? metrics.approximate_number_of_messages_not_visible : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">ApproximateNumberOfMessagesNotVisible</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Pedidos DynamoDB</span>
            <Database className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">
            {metrics ? metrics.orders_summary.total : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {metrics
              ? `${metrics.orders_summary.queued} QUEUED • ${metrics.orders_summary.processed} PROCESSED`
              : "Consultando tabla Orders..."}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Ingresos Totales</span>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">
            {metrics ? `$${Number(metrics.orders_summary.total_revenue).toFixed(2)}` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Suma acumulada en Orders</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "orders"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pedidos ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("products")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "products"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Productos ({products.length})
            </button>
          </div>

          {activeTab === "orders" ? (
            <div className="flex items-center gap-2">
              {["", "QUEUED", "PROCESSED"].map((st) => (
                <button
                  key={st || "ALL"}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    statusFilter === st
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {st || "Todos"}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Nuevo Producto
            </button>
          )}
        </div>

        {/* Orders Table */}
        {activeTab === "orders" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Order ID</th>
                  <th className="px-6 py-3.5 font-semibold">Cliente</th>
                  <th className="px-6 py-3.5 font-semibold">Ítems</th>
                  <th className="px-6 py-3.5 font-semibold">Total</th>
                  <th className="px-6 py-3.5 font-semibold">SQS MessageId</th>
                  <th className="px-6 py-3.5 font-semibold">Estado</th>
                  <th className="px-6 py-3.5 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      No hay pedidos registrados con este filtro.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.order_id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3.5 font-mono text-xs font-bold text-slate-900">
                        {order.order_id}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-800">
                        {order.customer_name}
                      </td>
                      <td className="px-6 py-3.5 text-slate-600">
                        {order.items.reduce((acc, i) => acc + i.quantity, 0)} uds.
                      </td>
                      <td className="px-6 py-3.5 font-bold text-slate-900">
                        ${Number(order.total_amount).toFixed(2)}
                      </td>
                      <td className="max-w-[180px] truncate px-6 py-3.5 font-mono text-xs text-slate-500">
                        {order.sqs_message_id || "—"}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            order.status === "PROCESSED"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-500">
                        {new Date(order.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Products CRUD Table */}
        {activeTab === "products" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Producto</th>
                  <th className="px-6 py-3.5 font-semibold">Categoría</th>
                  <th className="px-6 py-3.5 font-semibold">Precio</th>
                  <th className="px-6 py-3.5 font-semibold">Stock</th>
                  <th className="px-6 py-3.5 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => (
                  <tr key={product.product_id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image_url || "/products/laptop-pro.svg"}
                          alt={product.name}
                          className="h-11 w-11 rounded-xl bg-slate-100 object-cover"
                        />
                        <div>
                          <p className="font-bold text-slate-900">{product.name}</p>
                          <p className="font-mono text-xs text-slate-400">
                            {product.product_id}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-bold text-slate-900">
                      ${Number(product.price).toFixed(2)}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                        <Package className="h-3.5 w-3.5 text-slate-400" />
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(product)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                          title="Editar producto"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(product)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          title="Eliminar producto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Create/Edit Modal */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingProduct ? "Editar Producto" : "Nuevo Producto"}
              </h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 p-6">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Nombre del Producto
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Descripción
                </label>
                <textarea
                  required
                  minLength={4}
                  rows={3}
                  value={productForm.description}
                  onChange={(e) =>
                    setProductForm({ ...productForm, description: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Precio (USD)
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Stock
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Categoría
                  </label>
                  <input
                    type="text"
                    required
                    value={productForm.category}
                    onChange={(e) =>
                      setProductForm({ ...productForm, category: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Imagen (SVG incluido o URL)
                </label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <select
                    value={
                      PRODUCT_ICON_OPTIONS.some((o) => o.value === productForm.image_url)
                        ? productForm.image_url
                        : ""
                    }
                    onChange={(e) => {
                      if (e.target.value) {
                        setProductForm({ ...productForm, image_url: e.target.value });
                      }
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="">URL personalizada...</option>
                    {PRODUCT_ICON_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={productForm.image_url}
                    onChange={(e) =>
                      setProductForm({ ...productForm, image_url: e.target.value })
                    }
                    placeholder="/products/laptop-pro.svg"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {savingProduct && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingProduct ? "Guardar Cambios" : "Crear Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
