import Order from "@/models/Order";
import Product from "@/models/Product";

export async function confirmPayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature, note }) {
  if (!razorpayOrderId) return null;

  const order = await Order.findOne({ "razorpay.orderId": razorpayOrderId });
  if (!order) return null;

  if (order.paymentStatus === "paid") {
    return order; // already confirmed by the other path — nothing to do
  }

  order.paymentStatus = "paid";
  order.status = "confirmed";
  order.razorpay.paymentId = razorpayPaymentId || order.razorpay.paymentId;
  if (razorpaySignature) order.razorpay.signature = razorpaySignature;
  order.statusHistory.push({ status: "confirmed", note });
  await order.save();

  for (const item of order.items) {
    if (item.variant?.id) {
      // Decrement the specific variant's stock, not the product's base stock.
      await Product.findOneAndUpdate(
        { _id: item.product, "variants._id": item.variant.id },
        { $inc: { "variants.$.stock": -item.quantity } }
      );
    } else {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
    }
  }

  return order;
}