import React, { useState } from "react";
import {
  Cloud,
  LayoutDashboard,
  LogIn,
  LogOut,
  ShoppingBag,
  ShoppingCart,
  User as UserIcon,
  UserPlus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

function UserAvatar({ user }) {
  const [imgError, setImgError] = useState(false);

  if (user?.avatar_url && !imgError) {
    return (
      <img
        src={user.avatar_url}
        alt={user.username}
        onError={() => setImgError(true)}
        className="h-9 w-9 rounded-full object-cover ring-2 ring-indigo-500/40 bg-slate-100"
      />
    );
  }

  const initials = (user?.username || "U")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white ring-2 ring-indigo-200">
      {initials}
    </div>
  );
}

export default function Navbar({
  activeView,
  onNavigate,
  onOpenCart,
  onOpenAuth,
}) {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { itemCount } = useCart();

  const navBtnClass = (view) =>
    `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
      activeView === view
        ? "bg-indigo-50 text-indigo-700"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => onNavigate("catalog")}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-sm">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-base font-bold tracking-tight text-slate-900">
                CloudStore
              </span>
              <span className="block text-[11px] font-medium text-slate-500">
                AWS LocalStack • WSL2
              </span>
            </div>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            <button
              type="button"
              onClick={() => onNavigate("catalog")}
              className={navBtnClass("catalog")}
            >
              <ShoppingBag className="h-4 w-4" />
              Catálogo
            </button>

            {isAuthenticated && (
              <button
                type="button"
                onClick={() => onNavigate("profile")}
                className={navBtnClass("profile")}
              >
                <UserIcon className="h-4 w-4" />
                Mi Perfil
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => onNavigate("admin")}
                className={navBtnClass("admin")}
              >
                <LayoutDashboard className="h-4 w-4" />
                Panel Admin
              </button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenCart}
            className="relative inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <ShoppingCart className="h-4 w-4 text-indigo-600" />
            <span className="hidden sm:inline">Carrito</span>
            {itemCount > 0 && (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-bold text-white">
                {itemCount}
              </span>
            )}
          </button>

          {isAuthenticated ? (
            <div className="flex items-center gap-2 sm:gap-3 pl-2 border-l border-slate-200">
              <button
                type="button"
                onClick={() => onNavigate("profile")}
                className="flex items-center gap-2.5 rounded-xl px-2 py-1 text-left transition hover:bg-slate-100"
                title="Ver mi perfil y avatar en S3"
              >
                <UserAvatar key={user?.avatar_url || user?.user_id} user={user} />
                <div className="hidden sm:block">
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[130px] truncate text-sm font-semibold text-slate-900">
                      {user.username}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        isAdmin
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {user.role}
                    </span>
                  </div>
                  <span className="block max-w-[160px] truncate text-xs text-slate-500">
                    {user.email}
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  logout();
                  if (activeView === "admin" || activeView === "profile") {
                    onNavigate("catalog");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 p-2 text-xs font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenAuth("login")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Ingresar</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth("register")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Registrarse</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navegación móvil */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2 md:hidden overflow-x-auto">
        <button
          type="button"
          onClick={() => onNavigate("catalog")}
          className={navBtnClass("catalog")}
        >
          <ShoppingBag className="h-4 w-4" />
          Catálogo
        </button>
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => onNavigate("profile")}
            className={navBtnClass("profile")}
          >
            <UserIcon className="h-4 w-4" />
            Mi Perfil
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => onNavigate("admin")}
            className={navBtnClass("admin")}
          >
            <LayoutDashboard className="h-4 w-4" />
            Admin
          </button>
        )}
      </div>
    </header>
  );
}
