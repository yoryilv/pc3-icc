import React, { useState } from "react";
import { Check, CheckCircle2, Copy, Database, Layers, X } from "lucide-react";

export default function OrderConfirmationModal({ order, onClose }) {
  const [copiedField, setCopiedField] = useState("");

  if (!order) return null;

  const copyValue = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      setTimeout(() => setCopiedField(""), 1500);
    } catch {
      // Clipboard API opcional en contextos sin HTTPS
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-6 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold">¡Pedido Confirmado!</h2>
                <p className="text-sm text-emerald-100">
                  Guardado en DynamoDB y encolado en SQS
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          <div className="grid gap-3">
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Database className="h-3.5 w-3.5 text-indigo-600" />
                  Order ID (DynamoDB)
                </span>
                <code className="mt-0.5 block truncate text-sm font-bold text-slate-900">
                  {order.order_id}
                </code>
              </div>
              <button
                type="button"
                onClick={() => copyValue("order_id", order.order_id)}
                className="ml-3 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"
                title="Copiar Order ID"
              >
                {copiedField === "order_id" ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800">
                  <Layers className="h-3.5 w-3.5 text-amber-600" />
                  SQS MessageId (orders-queue)
                </span>
                <code className="mt-0.5 block truncate text-xs font-bold text-slate-900">
                  {order.sqs_message_id}
                </code>
              </div>
              <button
                type="button"
                onClick={() => copyValue("sqs_message_id", order.sqs_message_id || "")}
                className="ml-3 rounded-lg border border-amber-200 bg-white p-2 text-amber-700 hover:bg-amber-50"
                title="Copiar MessageId"
              >
                {copiedField === "sqs_message_id" ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span>Resumen ({order.items.length} productos)</span>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-800">
                Estado: {order.status}
              </span>
            </div>
            <ul className="space-y-2 text-sm">
              {order.items.map((item) => (
                <li key={item.product_id} className="flex justify-between text-slate-700">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span className="font-semibold text-slate-900">
                    ${Number(item.subtotal).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-base font-extrabold text-slate-900">
              <span>Total</span>
              <span>${Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Continuar Comprando
          </button>
        </div>
      </div>
    </div>
  );
}
