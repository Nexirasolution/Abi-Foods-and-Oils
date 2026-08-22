// models/Order.js
import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    image: { type: String, default: "" },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, default: "piece" },
  },
  { _id: false }
);

const TrackingSchema = new mongoose.Schema(
  {
    courier: { type: String, default: "" },
    trackingNumber: { type: String, default: "" },
    trackingUrl: { type: String, default: "" },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true, index: true },
      email: { type: String, default: "" },
      address: { type: String, required: true },
      city: { type: String, default: "" },
      state: { type: String, default: "Tamil Nadu" },
      pincode: { type: String, default: "" },
    },
    items: { type: [OrderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ["COD", "UPI", "Online"],
      default: "COD",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    razorpay: {
  orderId: { type: String, default: "", index: true, unique: true, sparse: true },
  paymentId: { type: String, default: "" },
  signature: { type: String, default: "" },
},
    status: {
      type: String,
      enum: ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    statusHistory: {
      type: [
        {
          status: String,
          note: String,
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    tracking: { type: TrackingSchema, default: () => ({}) },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);