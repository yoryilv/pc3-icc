import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { api } from "./api/client";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import AdminDashboard from "./components/AdminDashboard";
import AuthModal from "./components/AuthModal";
import CartDrawer from "./components/CartDrawer";
import Navbar from "./components/Navbar";
import OrderConfirmationModal from "./components/OrderConfirmationModal";
import ProductCatalog from "./components/ProductCatalog";
import ProfileView from "./components/ProfileView";

function AppShell() {
  const { isAuthenticated, isAdmin } = useAuth();
  const [activeView, setActiveView] = useState("catalog");
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [cartOpen, setCartOpen] = useState(false);
  const [authModal, setAuthModal] = useState({ open: false, mode: "login" });
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, type = "success") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch (err) {
      notify(err.message || "Error cargando productos desde DynamoDB.", "error");
    } finally {
      setLoadingProducts(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleNavigate = (view) => {
    if (view === "admin" && !isAdmin) {
      notify("Acceso restringido a administradores.", "error");
      return;
    }
    if (view === "profile" && !isAuthenticated) {
      setAuthModal({ open: true, mode: "login" });
      return;
    }
    setActiveView(view);
  };

  const handleOrderSuccess = async (order) => {
    setConfirmedOrder(order);
    await fetchProducts();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar
        activeView={activeView}
        onNavigate={handleNavigate}
        onOpenCart={() => setCartOpen(true)}
        onOpenAuth={(mode) => setAuthModal({ open: true, mode })}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {activeView === "catalog" && (
          <ProductCatalog
            products={products}
            loading={loadingProducts}
            onRefresh={fetchProducts}
            onNotify={notify}
          />
        )}

        {activeView === "profile" && isAuthenticated && (
          <ProfileView onNotify={notify} />
        )}

        {activeView === "admin" && isAdmin && (
          <AdminDashboard
            products={products}
            onCatalogChanged={fetchProducts}
            onNotify={notify}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500">
        CloudStore E-Commerce • React + Vite + Tailwind + FastAPI + LocalStack (DynamoDB, S3, SQS)
      </footer>

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        onOrderSuccess={handleOrderSuccess}
      />

      <AuthModal
        isOpen={authModal.open}
        initialMode={authModal.mode}
        onClose={() => setAuthModal((prev) => ({ ...prev, open: false }))}
        onSuccess={(loggedUser, mode) => {
          notify(
            mode === "register"
              ? `¡Bienvenido, ${loggedUser.username}! Cuenta creada.`
              : `Sesión iniciada como ${loggedUser.username}.`
          );
          if (loggedUser.role === "admin") {
            setActiveView("admin");
          }
        }}
      />

      <OrderConfirmationModal
        order={confirmedOrder}
        onClose={() => setConfirmedOrder(null)}
      />

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ${
            toast.type === "error"
              ? "bg-rose-600 text-white"
              : "bg-slate-900 text-white"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <AppShell />
      </CartProvider>
    </AuthProvider>
  );
}
