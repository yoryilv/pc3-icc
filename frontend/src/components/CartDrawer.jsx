import React, { useEffect, useState } from "react";
import { Loader2, Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export default function CartDrawer({ isOpen, onClose, onOrderSuccess }) {
  const { user } = useAuth();
  const { items, subtotal, updateQuantity, removeItem, clearCart } = useCart();
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.username) {
      setCustomerName(user.username);
    }
  }, [user]);

  if (!isOpen) return null;

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (items.length === 0) return;
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        customer_name: customerName.trim() || "Cliente Invitado",
        items: items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
      };
      const order = await api.createOrder(payload);
      clearCart();
      onOrderSuccess(order);
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo procesar el pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">Tu Carrito</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <ShoppingCart className="h-8 w-8" />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-800">
                Tu carrito está vacío
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Agrega productos del catálogo para enviar un pedido a DynamoDB y SQS.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.product_id}
                  className="flex gap-4 rounded-2xl border border-slate-200 p-3"
                >
                  <img
                    src={item.image_url || "/products/laptop-pro.svg"}
                    alt={item.name}
                    className="h-20 w-20 rounded-xl bg-slate-100 object-cover"
                  />
                  <div className="flex flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 line-clamp-1">
                          {item.name}
                        </h3>
                        <span className="text-xs text-slate-500">
                          ${Number(item.price).toFixed(2)} c/u
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product_id)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Eliminar producto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                          className="p-1.5 text-slate-600 hover:text-slate-900"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="px-2.5 text-xs font-bold text-slate-900">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                          disabled={item.quantity >= item.stock}
                          className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <span className="text-sm font-bold text-slate-900">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <form
            onSubmit={handleCheckout}
            className="border-t border-slate-200 bg-slate-50 p-6 space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Nombre del Cliente
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. María García"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {error}
              </div>
            )}

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Envío Cloud</span>
                <span className="font-medium text-emerald-600">Gratis</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold text-slate-900">
                <span>Total a Pagar</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando a DynamoDB y SQS...
                </>
              ) : (
                "Realizar Pedido"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
