import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import "@/models/Category";
import { deleteMediaFromCloudinary } from "@/lib/cloudinary";

function normalizeMedia(media) {
  if (!Array.isArray(media)) return undefined;
  return media.map((item) => ({
    url: item.url,
    publicId: item.publicId,
    type: item.type || item.mediaType || "image",
  }));
}

// Cleans up incoming variant rows from the admin form: coerces numbers,
// drops rows without a label, and normalizes the SKU casing.
function normalizeVariants(variants) {
  if (!Array.isArray(variants)) return undefined;
  const cleaned = variants
    .filter((v) => v && String(v.label || "").trim())
    .map((v) => ({
      // Keep the existing _id when editing so cart references / order
      // history that point at a specific variant don't get orphaned.
      _id: v._id || undefined,
      label: String(v.label).trim(),
      value: Number(v.value) || 0,
      unit: v.unit || "piece",
      sku: v.sku ? String(v.sku).trim().toUpperCase() : undefined,
      price: Number(v.price) || 0,
      compareAtPrice: Number(v.compareAtPrice) || 0,
      stock: Number(v.stock) || 0,
      isDefault: !!v.isDefault,
    }));

  if (cleaned.length && !cleaned.some((v) => v.isDefault)) {
    cleaned[0].isDefault = true;
  }
  return cleaned;
}

export async function GET(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const product =
      (await Product.findById(id).populate("category", "name slug")) ||
      (await Product.findOne({ slug: id }).populate("category", "name slug"));

    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json({ product });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch product." }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();

    if (body.media) {
      body.media = normalizeMedia(body.media);
    }

    if (body.variants) {
      body.variants = normalizeVariants(body.variants);

      const variantSkus = body.variants.map((v) => v.sku).filter(Boolean);
      if (variantSkus.length) {
        const dupVariantSku = await Product.findOne({
          _id: { $ne: id },
          $or: [
            { sku: { $in: variantSkus } },
            { "variants.sku": { $in: variantSkus } },
          ],
        });
        if (dupVariantSku) {
          return NextResponse.json(
            { error: "One or more variant SKUs are already in use." },
            { status: 400 }
          );
        }
      }
    }

    if (body.hasVariants !== undefined) {
      body.hasVariants = !!body.hasVariants && (body.variants?.length > 0);
    }

    if (body.sku !== undefined) {
      const sku = String(body.sku).trim().toUpperCase();
      if (!sku) {
        return NextResponse.json({ error: "SKU is required." }, { status: 400 });
      }
      const dupSku = await Product.findOne({ sku, _id: { $ne: id } });
      if (dupSku) {
        return NextResponse.json({ error: `SKU "${sku}" is already in use.` }, { status: 400 });
      }
      body.sku = sku;
    }

    try {
      const product = await Product.findByIdAndUpdate(id, body, { new: true, runValidators: true });
      if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
      return NextResponse.json({ product });
    } catch (err) {
      if (err.code === 11000) {
        return NextResponse.json({ error: "SKU must be unique." }, { status: 400 });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update product." }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const product = await Product.findById(id);

    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    if (product.media?.length) {
      await Promise.all(
        product.media.map((item) =>
          deleteMediaFromCloudinary(item.publicId, item.type || "image")
        )
      );
    }

    if (product.images?.length) {
      await Promise.all(
        product.images.map((item) => deleteMediaFromCloudinary(item.publicId, "image"))
      );
    }

    await product.deleteOne();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete product error:", err);
    return NextResponse.json({ error: "Failed to delete product." }, { status: 500 });
  }
}