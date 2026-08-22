"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";

export default function ProductDetailActions({ product }) {
  const { addItem } = useCart();
  const router = useRouter();

  const hasVariants = product.hasVariants && product.variants?.length > 0;

  const [selectedVariant, setSelectedVariant] = useState(() => {
    if (!hasVariants) return null;
    return (
      product.variants.find((v) => v.isDefault) ||
      product.variants.find((v) => v.stock > 0) ||
      product.variants[0]
    );
  });
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const activePrice = selectedVariant ? selectedVariant.price : product.price;
  const activeCompareAtPrice = selectedVariant ? selectedVariant.compareAtPrice : product.compareAtPrice;
  const activeStock = selectedVariant ? selectedVariant.stock : product.stock;
  const outOfStock = activeStock <= 0;
  const hasDiscount = activeCompareAtPrice > activePrice;

  function buildCartPayload() {
    if (!selectedVariant) return product;
    // Carry the selected variant along so CartContext can key the line item
    // by product + variant, and use the variant's own price/stock.
    return {
      ...product,
      price: activePrice,
      compareAtPrice: activeCompareAtPrice,
      variant: {
        id: selectedVariant._id,
        label: selectedVariant.label,
        value: selectedVariant.value,
        unit: selectedVariant.unit,
        sku: selectedVariant.sku,
        price: selectedVariant.price,
      },
    };
  }

  function handleSelectVariant(v) {
    setSelectedVariant(v);
    setQty(1); // reset quantity so it never exceeds the new variant's stock
  }

  function handleAdd() {
    addItem(buildCartPayload(), qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  function handleBuyNow() {
    addItem(buildCartPayload(), qty);
    router.push("/cart");
  }

  return (
    <div className="mt-8">
      {hasVariants && (
        <div className="mb-6">
          <span className="mb-2 block font-body italic text-sm font-semibold text-ink">
            Select Size
          </span>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => {
              const variantOutOfStock = v.stock <= 0;
              const isSelected = selectedVariant?._id
                ? selectedVariant._id === v._id
                : selectedVariant?.label === v.label;
              return (
                <button
                  key={v._id || v.label}
                  type="button"
                  onClick={() => handleSelectVariant(v)}
                  disabled={variantOutOfStock}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    isSelected
                      ? "border-forest bg-forest text-ivory"
                      : "border-gold/30 text-ink/70 hover:bg-champagne"
                  }`}
                >
                  {v.label} · ₹{v.price}
                  {variantOutOfStock && " (Out of Stock)"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-body italic text-xl font-bold text-forest">₹{activePrice}</span>
        {hasDiscount && (
          <span className="text-sm text-muted line-through">₹{activeCompareAtPrice}</span>
        )}
      </div>

      {!outOfStock && (
        <div className="mb-6 flex items-center gap-4">
          <span className="font-body italic text-sm font-semibold text-ink">Quantity</span>
          <div className="flex items-center rounded-full border border-gold/30">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="font-body italic px-4 py-2 text-lg text-forest"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="font-body italic w-8 text-center text-sm font-semibold">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(activeStock, q + 1))}
              className="font-body italic px-4 py-2 text-lg text-forest"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleAdd}
          disabled={outOfStock}
          className="font-body italic flex-1 rounded-full border border-forest px-8 py-3.5 text-sm font-semibold text-forest transition hover:bg-champagne disabled:cursor-not-allowed disabled:border-muted/40 disabled:text-muted"
        >
          {outOfStock ? "Out of Stock" : added ? "Added to Cart ✓" : "Add to Cart"}
        </button>
        <button
          onClick={handleBuyNow}
          disabled={outOfStock}
          className="font-body italic flex-1 rounded-full bg-forest px-8 py-3.5 text-sm font-semibold text-ivory shadow-soft transition hover:bg-forest-light disabled:cursor-not-allowed disabled:bg-muted/40"
        >
          Buy Now
        </button>
      </div>
    </div>
  );
}