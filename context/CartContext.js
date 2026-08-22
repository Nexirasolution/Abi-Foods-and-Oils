"use client";

import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "abi_cart_v1";

// Builds the unique key for a cart line: same product + different variant
// (e.g. 100g vs 500g) must stay as separate lines, not merge into one.
function buildLineId(productId, variant) {
  const variantKey = variant?.id || variant?.label || "base";
  return `${productId}::${variantKey}`;
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Backfill lineId for carts saved before variants existed, so old
        // saved carts don't break.
        setItems(
          parsed.map((i) => ({
            ...i,
            lineId: i.lineId || buildLineId(i.productId, i.variant),
          }))
        );
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  // `product` may optionally carry a `.variant` object:
  // { id, label, value, unit, sku, price }
  // as set by ProductDetailActions when the product has size/weight variants.
  function addItem(product, quantity = 1) {
    const variant = product.variant || null;
    const lineId = buildLineId(product._id, variant);

    setItems((prev) => {
      const existing = prev.find((i) => i.lineId === lineId);
      if (existing) {
        return prev.map((i) =>
          i.lineId === lineId ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [
        ...prev,
        {
          lineId,
          productId: product._id,
          name: product.name,
          price: variant ? variant.price : product.price,
          unit: variant ? variant.unit : product.unit,
          image: product.media?.[0]?.url || product.images?.[0]?.url || "",
          stock: variant ? undefined : product.stock, // per-variant stock isn't tracked client-side; server re-validates on checkout
          variant: variant
            ? {
                id: variant.id,
                label: variant.label,
                value: variant.value,
                unit: variant.unit,
                sku: variant.sku,
              }
            : null,
          quantity,
        },
      ];
    });
  }

  function updateQuantity(lineId, quantity) {
    if (quantity <= 0) {
      removeItem(lineId);
      return;
    }
    setItems((prev) => prev.map((i) => (i.lineId === lineId ? { ...i, quantity } : i)));
  }

  function removeItem(lineId) {
    setItems((prev) => prev.filter((i) => i.lineId !== lineId));
  }

  function clearCart() {
    setItems([]);
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, updateQuantity, removeItem, clearCart, subtotal, count, hydrated }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}