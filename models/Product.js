import mongoose from "mongoose";

const MediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["image", "video"],
      default: "image",
    },
  },
  { _id: false }
);

// One row per size/weight/quantity option, e.g. 100g, 500g, 1kg, 6-pack.
const VariantSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true }, // "100g", "500ml", "1kg"
    value: { type: Number, required: true },              // 100, 500, 1
    unit: {
      type: String,
      enum: ["gram", "kg", "ml", "litre", "piece"],
      required: true,
    },
    sku: { type: String, trim: true, uppercase: true }, // optional per-variant SKU
    price: { type: Number, required: true },
    compareAtPrice: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false }, // pre-selected on the product page
  },
  { _id: true } // keep _id so the cart can reference a specific variant
);

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    // Base price/stock/unit. Used directly when hasVariants is false, and act
    // as a fallback / "starting from" figure when the product has variants.
    price: { type: Number, required: true },
    compareAtPrice: { type: Number, default: 0 },
    unit: { type: String, default: "piece" },
    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },

    // Size / weight / quantity variants
    hasVariants: { type: Boolean, default: false },
    variants: { type: [VariantSchema], default: [] },

    // Images + Videos
    media: {
      type: [MediaSchema],
      default: [],
    },

    tags: { type: [String], default: [] },

    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    attributes: {
      handmade: { type: Boolean, default: true },
      natural: { type: Boolean, default: true },
      ecoFriendly: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

ProductSchema.index({
  name: "text",
  description: "text",
  tags: "text",
});

export default mongoose.models.Product ||
  mongoose.model("Product", ProductSchema);