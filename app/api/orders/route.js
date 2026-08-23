import { NextResponse } from "next/server";
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

export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const paymentStatus = searchParams.get("paymentStatus");
    const limit = parseInt(searchParams.get("limit") || "0", 10);

    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    let cursor = Order.find(query).sort({ createdAt: -1 });
    if (limit) cursor = cursor.limit(limit);

    const orders = await cursor;
    return NextResponse.json({ orders });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch orders." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { customer, items, paymentMethod, shippingFee = 0 } = body;

    if (!customer?.name || !customer?.phone || !customer?.address) {
      return NextResponse.json({ error: "Name, phone and address are required." }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }

    // Validate stock and compute totals server-side
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) {
        return NextResponse.json({ error: `Product unavailable: ${item.name || item.productId}` }, { status: 400 });
      }
      if (product.stock < item.quantity) {
        return NextResponse.json({ error: `Insufficient stock for ${product.name}.` }, { status: 400 });
      }

      const firstImage = product.media?.find((m) => m.type === "image");

      subtotal += product.price * item.quantity;
      validatedItems.push({
        product: product._id,
        name: product.name,
        sku: product.sku || "",
        image: firstImage?.url || "",
        price: product.price,
        quantity: item.quantity,
        unit: product.unit,
      });
    }

    const total = subtotal + Number(shippingFee || 0);
    const orderNumber = await generateOrderNumber();

    const order = await Order.create({
      orderNumber,
      customer,
      items: validatedItems,
      subtotal,
      shippingFee,
      total,
      paymentMethod: paymentMethod || "COD",
      // paymentStatus defaults to "pending" per the schema
      status: "pending",
      statusHistory: [{ status: "pending", note: "Order placed" }],
    });

    // Decrement stock (COD / immediate orders; online orders should decrement
    // on payment verification instead if you want to avoid overselling)
    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to place order." }, { status: 500 });
  }
}