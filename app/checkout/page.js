"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { INDIAN_STATES } from "@/lib/indianStates";

export default function CheckoutPage() {
  const { items, subtotal, clearCart, hydrated } = useCart();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "Tamil Nadu",
    pincode: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [placedOrder, setPlacedOrder] = useState(null);
  const [settings, setSettings] = useState({
    shippingFee: 49,
    freeShipping: 999,
    stateShippingRates: [],
    storeName: "Abi Foods and Oils",
  });

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) setSettings(data.settings);
      })
      .catch(() => {});
  }, []);

  const stateFee = useMemo(() => {
    const match = (settings.stateShippingRates || []).find(
      (r) => r.state?.trim().toLowerCase() === form.state?.trim().toLowerCase()
    );
    return match ? Number(match.fee) : Number(settings.shippingFee);
  }, [settings, form.state]);

  const shippingFee = subtotal >= Number(settings.freeShipping) ? 0 : stateFee;
  const total = subtotal + shippingFee;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validate() {
    if (items.length === 0) {
      setError("Your cart is empty.");
      return false;
    }
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, "").slice(-10))) {
      setError("Enter a valid 10-digit phone number.");
      return false;
    }
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!validate()) return;

    if (!window.Razorpay) {
      setError("Payment gateway not loaded yet. Please try again.");
      return;
    }

    setLoading(true);
    try {
      // Creates the Razorpay order AND a "pending" order in our DB —
      // so it already exists (and is visible to admin) before payment
      // even starts. `items` here already includes each line's `variant`
      // (or null), which the server re-validates and re-prices.
      const orderRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer: form, items, shippingFee }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || "Failed to start payment.");

      const rzpOrder = orderData.order;

      const rzp = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        name: settings.storeName || "Abi Foods and Oils",
        description: "Order Payment",
        order_id: rzpOrder.id,
        prefill: {
          name: form.name,
          contact: form.phone,
          email: form.email,
        },
        theme: { color: "#1f3d2b" },
        handler: async function (response) {
          try {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(verifyData.error || "Payment verification failed.");

            setPlacedOrder(verifyData.order);
            clearCart();
          } catch (err) {
            // Payment likely still succeeded server-side (verify failed for
            // some other reason, e.g. a dropped network call) — the webhook
            // will still confirm the order. Don't scare the user off; point
            // them at order tracking instead of a hard "failed" message.
            setError(
              `${err.message} If money was deducted, check "Track Order" with your phone number — it may still confirm shortly.`
            );
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
      });

      rzp.on("payment.failed", function () {
        setError("Payment failed. Please try again.");
        setLoading(false);
      });

      rzp.open();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (!hydrated) return null;

  if (placedOrder) {
    return (
      <>
        <Navbar settings={settings} />
        <section className="mx-auto max-w-xl px-5 py-20 text-center md:px-8">
          <span className="badge-stamp mx-auto flex h-16 w-16 items-center justify-center border-gold/40 bg-forest text-ivory">
            ✓
          </span>
          <h1 className="mt-6 font-body italic text-3xl font-bold text-forest">Order Placed!</h1>
          <p className="mt-3 text-muted">
            Thank you for choosing {settings.storeName || "Abi Foods and Oils"}. Your order number is:
          </p>
          <p className="mt-2 font-body italic text-xl font-bold text-terracotta">{placedOrder.orderNumber}</p>
          <p className="mt-4 text-sm text-muted">
            Save this number, or use your phone number, to track your order anytime.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            
            <a  href="/track-order"
              className="rounded-full border border-forest/30 px-8 py-3 text-sm font-semibold text-forest hover:bg-champagne"
            >
              Track Order
            </a>
            
            <a  href="/products"
              className="rounded-full bg-forest px-8 py-3 text-sm font-semibold text-ivory shadow-soft hover:bg-forest-light"
            >
              Continue Shopping
            </a>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <Navbar settings={settings} />
      <section className="mx-auto max-w-4xl px-5 py-12 md:px-8">
        <h1 className="font-body italic text-3xl font-bold text-forest">Checkout</h1>

        {items.length === 0 ? (
          <p className="mt-8 text-muted">Your cart is empty. <a href="/products" className="text-forest underline">Shop now</a></p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 grid gap-10 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full Name" required value={form.name} onChange={(v) => update("name", v)} />
                <Field label="Phone Number" required value={form.phone} onChange={(v) => update("phone", v)} type="tel" />
              </div>
              <Field label="Email (optional)" value={form.email} onChange={(v) => update("email", v)} type="email" />
              <Field label="Delivery Address" required value={form.address} onChange={(v) => update("address", v)} textarea />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="City" value={form.city} onChange={(v) => update("city", v)} />
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink/70">
                    State <span className="text-terracotta">*</span>
                  </span>
                  <select
                    required
                    value={form.state}
                    onChange={(e) => update("state", e.target.value)}
                    className="w-full rounded-xl border border-gold/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
                  >
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <Field label="Pincode" value={form.pincode} onChange={(v) => update("pincode", v)} />
              </div>

              <p className="text-xs text-muted">
                You'll be redirected to Razorpay's secure checkout to complete payment.
              </p>

              {error && <p className="text-sm text-terracotta">{error}</p>}
            </div>

            <div className="h-fit rounded-xl2 border border-gold/15 bg-white p-6 shadow-card">
              <h2 className="font-body italic text-lg font-bold text-forest">Order Summary</h2>
              <div className="mt-4 space-y-2">
                {items.map((item) => (
                  <div key={item.lineId} className="flex justify-between text-sm text-ink/80">
                    <span>
                      {item.name}
                      {item.variant?.label && ` (${item.variant.label})`} × {item.quantity}
                    </span>
                    <span>₹{item.price * item.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="leaf-divider my-4" />
              <div className="flex justify-between text-sm text-ink/80">
                <span>Subtotal</span>
                <span>₹{subtotal}</span>
              </div>
              <div className="flex justify-between text-sm text-ink/80">
                <span>Shipping ({form.state})</span>
                <span>{shippingFee === 0 ? "Free" : `₹${shippingFee}`}</span>
              </div>
              <div className="mt-2 flex justify-between font-body italic text-base font-bold text-forest">
                <span>Total</span>
                <span>₹{total}</span>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full rounded-full bg-forest px-8 py-3.5 text-sm font-semibold text-ivory shadow-soft transition hover:bg-forest-light disabled:opacity-60"
              >
                {loading ? "Processing..." : "Pay & Place Order"}
              </button>
            </div>
          </form>
        )}
      </section>
      <Footer />
    </>
  );
}

function Field({ label, value, onChange, required, type = "text", textarea }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink/70">
        {label} {required && <span className="text-terracotta">*</span>}
      </span>
      {textarea ? (
        <textarea
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-gold/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      ) : (
        <input
          required={required}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-gold/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      )}
    </label>
  );
}