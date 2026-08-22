import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import { confirmPayment } from "@/lib/confirmPayment";

export async function POST(req) {
  try {
    // Must read the raw text (not req.json()) — the signature is computed
    // over the exact raw body bytes.
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      console.error("RAZORPAY_WEBHOOK_SECRET is not set.");
      return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (!signature || expectedSignature !== signature) {
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    await connectDB();

    if (event === "payment.captured" || event === "order.paid") {
      const payment = payload.payload?.payment?.entity;
      const razorpayOrderId = payment?.order_id || payload.payload?.order?.entity?.id;

      const order = await confirmPayment({
        razorpayOrderId,
        razorpayPaymentId: payment?.id,
        razorpaySignature: "",
        note: "Paid via Razorpay (webhook)",
      });

      if (!order) {
        console.error("Webhook: no matching order for razorpay order", razorpayOrderId);
      }
    }

    if (event === "payment.failed") {
      const payment = payload.payload?.payment?.entity;
      const order = await Order.findOne({ "razorpay.orderId": payment?.order_id });
      if (order && order.paymentStatus !== "paid") {
        order.paymentStatus = "failed";
        order.status = "cancelled";
        order.statusHistory.push({ status: "cancelled", note: "Payment failed (webhook)" });
        await order.save();
      }
    }

    // Always 200 on anything we've handled (or intentionally ignored) so
    // Razorpay doesn't retry indefinitely.
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}