import { NextResponse } from "next/server";
import { getRazorpay } from "@/lib/razorpay";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";

async function generateOrderNumber() {
  const prefix = "ABI";
  const date = new Date();
  const datePart = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;
  const count = await Order.countDocuments();
  const seq = (count + 1).toString().padStart(4, "0");
  return `${prefix}-${datePart}-${seq}`;
}

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { customer, items, shippingFee = 0 } = body;

    if (!customer?.name || !customer?.phone || !customer?.address) {
      return NextResponse.json({ error: "Name, phone and address are required." }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }

    // Recompute everything from the DB — never trust a client-supplied
    // price or total. Each cart line may optionally carry `item.variant.id`
    // (set by CartContext when the product has size/weight variants); when
    // present we price and check stock against that specific variant
    // instead of the product's base price/stock.
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) {
        return NextResponse.json({ error: `Product unavailable: ${item.name || item.productId}` }, { status: 400 });
      }

      let unitPrice;
      let unit;
      let variantSnapshot = null;

      if (item.variant?.id) {
        const variant = product.variants?.id(item.variant.id);
        if (!variant) {
          return NextResponse.json(
            { error: `The selected size for ${product.name} is no longer available.` },
            { status: 400 }
          );
        }
        if (variant.stock < item.quantity) {
          return NextResponse.json(
            { error: `Insufficient stock for ${product.name} (${variant.label}).` },
            { status: 400 }
          );
        }
        unitPrice = variant.price;
        unit = variant.unit;
        variantSnapshot = {
          id: variant._id,
          label: variant.label,
          value: variant.value,
          unit: variant.unit,
          sku: variant.sku || product.sku,
        };
      } else {
        if (product.hasVariants && product.variants?.length) {
          // Safety net: a variant product should never reach checkout
          // without a chosen variant, but if it does, don't silently sell
          // it at the fallback base price.
          return NextResponse.json(
            { error: `Please select a size for ${product.name}.` },
            { status: 400 }
          );
        }
        if (product.stock < item.quantity) {
          return NextResponse.json({ error: `Insufficient stock for ${product.name}.` }, { status: 400 });
        }
        unitPrice = product.price;
        unit = product.unit;
      }

      subtotal += unitPrice * item.quantity;
      validatedItems.push({
        product: product._id,
        name: product.name,
        image: product.media?.[0]?.url || product.images?.[0]?.url || "",
        price: unitPrice,
        quantity: item.quantity,
        unit,
        variant: variantSnapshot,
      });
    }

    const total = subtotal + Number(shippingFee || 0);
    if (total <= 0) {
      return NextResponse.json({ error: "Invalid order total." }, { status: 400 });
    }

    const razorpay = getRazorpay();
    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(total * 100), // paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    const orderNumber = await generateOrderNumber();

    // Written as "pending" right away — this is what makes the order show
    // up in admin even if the browser closes before payment completes.
    // The webhook (or the client's verify call) later flips this to paid,
    // which is also where variant stock actually gets decremented.
    await Order.create({
      orderNumber,
      customer,
      items: validatedItems,
      subtotal,
      shippingFee,
      total,
      paymentMethod: "Online",
      paymentStatus: "pending",
      status: "pending",
      statusHistory: [{ status: "pending", note: "Awaiting payment" }],
      razorpay: { orderId: rzpOrder.id, paymentId: "", signature: "" },
    });

    return NextResponse.json({ order: rzpOrder });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Failed to create Razorpay order." }, { status: 500 });
  }
}