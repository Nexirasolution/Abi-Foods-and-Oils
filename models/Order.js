// models/Order.js
import mongoose from "mongoose";

// Snapshot of the variant chosen at checkout (e.g. 500g @ ₹199), kept on the
// order line so it stays accurate even if the product's variants change or
// are removed later. `id` matches the Product's variants[]._id at the time
// of purchase — used by confirmPayment to decrement the right variant's stock.
const OrderItemVariantSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, default: null },
    label: { type: String, default: "" },
    value: { type: Number, default: null },
    unit: { type: String, default: "" },
    sku: { type: String, default: "" },
  },
  { _id: false }
);

const OrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    image: { type: String, default: "" },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, default: "piece" },
    // Null for simple (non-variant) products.
    variant: { type: OrderItemVariantSchema, default: null },
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