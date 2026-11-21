import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const CART_STORAGE_KEY = "cloudstore_cart_v1";
const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (product) => {
    if (!product || product.stock <= 0) return;
    setItems((prev) => {
      const existing = prev.find((item) => item.product_id === product.product_id);
      if (existing) {
        const nextQty = Math.min(existing.quantity + 1, product.stock);
        return prev.map((item) =>
          item.product_id === product.product_id
            ? { ...item, quantity: nextQty, stock: product.stock, price: product.price }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: product.product_id,
          name: product.name,
          price: Number(product.price),
          image_url: product.image_url,
          category: product.category,
          stock: Number(product.stock),
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (productId, nextQuantity) => {
    setItems((prev) =>
      prev
        .map((item) => {
          if (item.product_id !== productId) return item;
          const clamped = Math.min(Math.max(0, nextQuantity), item.stock || 99);
          return { ...item, quantity: clamped };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (productId) => {
    setItems((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const clearCart = () => setItems([]);

  const summary = useMemo(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return { itemCount, subtotal: Number(subtotal.toFixed(2)) };
  }, [items]);

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount: summary.itemCount,
        subtotal: summary.subtotal,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart debe utilizarse dentro de CartProvider");
  }
  return ctx;
}
