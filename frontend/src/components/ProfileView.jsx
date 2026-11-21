import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  HardDrive,
  Loader2,
  Package,
  RefreshCw,
  Upload,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function ProfileView({ onNotify }) {
  const { user, updateProfile } = useAuth();
  const [username, setUsername] = useState(user?.username || "");
  const [avatarFile, setAvatarFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    setUsername(user?.username || "");
  }, [user]);

  useEffect(() => {
    if (!avatarFile) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(avatarFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const loadMyOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const data = await api.getMyOrders();
      setOrders(data);
    } catch (err) {
      onNotify?.(err.message || "Error cargando historial de pedidos.", "error");
    } finally {
      setLoadingOrders(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadMyOrders();
  }, [loadMyOrders]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({
        username: username.trim(),
        avatarFile,
      });
      setAvatarFile(null);
      onNotify?.("Perfil y avatar S3 actualizados correctamente.");
    } catch (err) {
      onNotify?.(err.message || "No se pudo actualizar el perfil.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const displayedAvatar = previewUrl || user.avatar_url;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Perfil y subida S3 */}
      <section className="lg:col-span-5 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600">
            <HardDrive className="h-4 w-4" />
            Almacenamiento de Avatares en S3
          </div>
          <h2 className="mt-1 text-xl font-extrabold text-slate-900">Mi Perfil</h2>

          <form onSubmit={handleSave} className="mt-6 space-y-5">
            <div className="flex items-center gap-5">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-indigo-200 bg-slate-100">
                {displayedAvatar ? (
                  <img
                    src={displayedAvatar}
                    alt={user.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-indigo-600 text-xl font-bold text-white">
                    {user.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  <Upload className="h-4 w-4 text-indigo-600" />
                  {avatarFile ? avatarFile.name : "Subir nuevo avatar a S3"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    className="hidden"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                  />
                </label>

                {user.avatar_url && (
                  <a
                    href={user.avatar_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 truncate text-xs text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{user.avatar_url}</span>
                  </a>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Nombre de Usuario
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3.5 text-xs">
              <div>
                <span className="text-slate-400">Correo</span>
                <p className="font-semibold text-slate-800 truncate">{user.email}</p>
              </div>
              <div>
                <span className="text-slate-400">Rol</span>
                <p className="font-bold uppercase text-indigo-700">{user.role}</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Subiendo a S3 y guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Guardar Cambios
                </>
              )}
            </button>
          </form>
        </div>
      </section>

      {/* Historial de pedidos */}
      <section className="lg:col-span-7">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-extrabold text-slate-900">Mis Pedidos</h3>
              <p className="text-xs text-slate-500">
                Consultados desde DynamoDB tabla <code>Orders</code>
              </p>
            </div>
            <button
              type="button"
              onClick={loadMyOrders}
              disabled={loadingOrders}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingOrders ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>

          {loadingOrders ? (
            <div className="py-12 text-center text-sm text-slate-500">Cargando pedidos...</div>
          ) : orders.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 py-12 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">
                Aún no has realizado pedidos con esta cuenta.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {orders.map((order) => (
                <div
                  key={order.order_id}
                  className="rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-200"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <code className="text-sm font-bold text-slate-900">{order.order_id}</code>
                      <span className="ml-2 text-xs text-slate-500">
                        {new Date(order.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        order.status === "PROCESSED"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-slate-600">
                    {order.items.map((item) => `${item.quantity}x ${item.name}`).join(" • ")}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
                    <span className="truncate text-slate-400">
                      SQS ID: <code>{order.sqs_message_id || "N/A"}</code>
                    </span>
                    <span className="text-sm font-extrabold text-slate-900">
                      ${Number(order.total_amount).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
