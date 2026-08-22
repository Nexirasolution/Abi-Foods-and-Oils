import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { confirmPayment } from "@/lib/confirmPayment";

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment details." }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
    }

    const order = await confirmPayment({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      note: "Paid via Razorpay (client redirect)",
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found for this payment." }, { status: 404 });
    }

    return NextResponse.json({ order }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Payment verification failed." }, { status: 500 });
  }
}