"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { BagIcon, LeafIcon } from "./Icons";

export default function ProductCard({ product }) {
  const { addItem } = useCart();
  const media = product.media?.[0] || product.images?.[0];

  const image = media?.url;
  const mediaType = media?.type || media?.mediaType || "image";

  const hasVariants = product.hasVariants && product.variants?.length > 0;

  // With variants, "in stock" means at least one variant has stock.
  const outOfStock = hasVariants
    ? product.variants.every((v) => v.stock <= 0)
    : product.stock <= 0;

  // Price range across variants, or the simple product's own price.
  const variantPrices = hasVariants ? product.variants.map((v) => v.price) : [];
  const minVariantPrice = hasVariants ? Math.min(...variantPrices) : null;
  const maxVariantPrice = hasVariants ? Math.max(...variantPrices) : null;
  const singlePriceVariants = hasVariants && minVariantPrice === maxVariantPrice;

  // The card always leads with the CHEAPEST variant's price ("From ₹X"),
  // so the discount badge has to be based on that same variant — otherwise
  // you can end up advertising a % OFF that belongs to a different size.
  const cheapestVariant = hasVariants
    ? product.variants.reduce((min, v) => (v.price < min.price ? v : min), product.variants[0])
    : null;

  const hasDiscount = hasVariants
    ? cheapestVariant.compareAtPrice > cheapestVariant.price
    : product.compareAtPrice > product.price;

  const discountBasePrice = hasVariants ? cheapestVariant.price : product.price;
  const discountCompareAtPrice = hasVariants ? cheapestVariant.compareAtPrice : product.compareAtPrice;

  const discountPercent = hasDiscount
    ? Math.round(((discountCompareAtPrice - discountBasePrice) / discountCompareAtPrice) * 100)
    : 0;

  function handleQuickAdd() {
    // Variant products need the customer to pick a size first, so quick-add
    // just sends them to the product page instead of guessing a default.
    if (hasVariants) return;
    addItem(product, 1);
  }

  return (
    <div className="card-hover group relative flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-gold/15 bg-white shadow-card">
      <Link href={`/products/${product.slug}`} className="relative block aspect-square overflow-hidden bg-champagne">
        {image ? (
          mediaType === "video" ? (
            <video
              src={image}
              muted
              autoPlay
              loop
              playsInline
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, 25vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-forest/30">
            <LeafIcon className="h-10 w-10 sm:h-12 sm:w-12" />
          </div>
        )}

        {outOfStock && (
          <span className="absolute left-2 top-2 sm:left-3 sm:top-3 rounded-full bg-ink/80 px-2.5 py-1 sm:px-3 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-ivory">
            Out of Stock
          </span>
        )}

        {!outOfStock && hasDiscount && (
          <span className="absolute right-2 top-2 sm:right-3 sm:top-3 rounded-full bg-terracotta px-2.5 py-1 sm:px-3 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-ivory">
            {discountPercent}% OFF
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <p className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wide text-gold-dark">
          {product.category?.name}
        </p>
        <Link href={`/products/${product.slug}`}>
          <h3 className="mt-1 line-clamp-2 min-h-[2.25rem] sm:min-h-[2.5rem] font-body italic text-sm sm:text-base font-semibold leading-snug text-ink hover:text-forest">
            {product.name}
          </h3>
        </Link>
        <div className="mt-auto flex items-end sm:items-center justify-between gap-2 pt-3 sm:pt-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2">
              {hasVariants ? (
                <>
                  <span className="font-body italic text-base sm:text-lg font-bold text-forest">
                    {singlePriceVariants ? `₹${minVariantPrice}` : `From ₹${minVariantPrice}`}
                  </span>
                  {/* Only show a strikethrough when there's one clear price to
                      contrast it with — a range + a single compare price reads
                      as wrong, so we rely on the corner badge for ranges. */}
                  {hasDiscount && singlePriceVariants && (
                    <span className="text-[11px] sm:text-xs text-muted line-through">
                      ₹{discountCompareAtPrice}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-body italic text-base sm:text-lg font-bold text-forest">₹{product.price}</span>
                  {hasDiscount && (
                    <span className="text-[11px] sm:text-xs text-muted line-through">₹{product.compareAtPrice}</span>
                  )}
                </>
              )}
            </div>
            <p className="text-[10px] sm:text-[11px] text-muted">
              {hasVariants
                ? `${product.variants.length} ${product.variants.length === 1 ? "size" : "sizes"}`
                : product.unit}
            </p>
          </div>

          {hasVariants ? (
            <Link
              href={`/products/${product.slug}`}
              className="flex h-8 sm:h-9 shrink-0 items-center rounded-full bg-forest px-2.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-ivory transition hover:bg-forest-light"
            >
              View Options
            </Link>
          ) : (
            <button
              onClick={handleQuickAdd}
              disabled={outOfStock}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest text-ivory transition hover:bg-forest-light disabled:cursor-not-allowed disabled:bg-muted/40"
              aria-label="Add to cart"
            >
              <BagIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}