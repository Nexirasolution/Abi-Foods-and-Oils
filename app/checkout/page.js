"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { INDIAN_STATES } from "@/lib/indianStates";

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

const FIELD_ORDER = ["name", "phone", "email", "address", "city", "state", "pincode"];

// Collapse repeated whitespace and trim
const clean = (v) => (v ?? "").replace(/\s+/g, " ").trim();



// Phone: digits only, no country code or leading 0 — exactly 10 digits
function normalizePhone(raw) {
  return (raw ?? "").replace(/\D/g, "").slice(0, 10);
}

const NAME_RE = /^[\p{L}][\p{L}\s.'’-]*$/u;
const CITY_RE = /^[\p{L}][\p{L}\s.'’()-]*$/u;
const ADDRESS_RE = /^[\p{L}\p{N}\s,.\-/#()&'’:]+$/u;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;

const letterCount = (s) => (s.match(/\p{L}/gu) || []).length;

const validators = {
  name(v) {
    const s = clean(v);
    if (!s) return "Enter your full name.";
    if (s.length < 3) return "Name must be at least 3 characters.";
    if (s.length > 60) return "Name must be 60 characters or fewer.";
    if (!NAME_RE.test(s)) return "Name can only contain letters, spaces, and . ' -";
    if (letterCount(s) < 3) return "Enter your full name.";
    if (/(.)\1{3,}/u.test(s)) return "Enter a valid name.";
    return "";
  },

  phone(v) {
    const digits = normalizePhone(v);
    if (!digits) return "Enter your phone number.";
    if (digits.length !== 10) return "Phone number must be exactly 10 digits.";
    if (!/^[6-9]/.test(digits)) return "Indian mobile numbers start with 6, 7, 8, or 9.";
    if (new Set(digits).size < 3) return "Enter a valid phone number.";
    if (/^(0123456789|1234567890|9876543210|6789012345)$/.test(digits)) {
      return "Enter a valid phone number.";
    }
    return "";
  },

  email(v) {
    const s = (v ?? "").trim();
    if (!s) return ""; // optional
    if (s.length > 254) return "Email is too long.";
    if (/\.\./.test(s) || !EMAIL_RE.test(s)) return "Enter a valid email address.";
    return "";
  },

  address(v) {
    const s = clean(v);
    if (!s) return "Enter your delivery address.";
    if (s.length < 15) return "Address is too short. Include house/flat no., street, and area.";
    if (s.length > 200) return "Address must be 200 characters or fewer.";
    if (!ADDRESS_RE.test(s)) {
      return "Address contains invalid characters. Use letters, numbers, and , . - / # ( ) & only.";
    }
    if (letterCount(s) < 8) return "Enter a complete address with street and area names.";
    if (s.split(" ").length < 3) return "Enter a complete address (at least 3 words).";
    if (/^\d+$/.test(s.replace(/[\s,.\-/#]/g, ""))) return "Address can't be only numbers.";
    if (/(.)\1{4,}/u.test(s)) return "Enter a valid address.";
    return "";
  },

  city(v) {
    const s = clean(v);
    if (!s) return "Enter your city.";
    if (s.length < 2) return "Enter a valid city.";
    if (s.length > 50) return "City must be 50 characters or fewer.";
    if (!CITY_RE.test(s)) return "City can only contain letters, spaces, and . ' - ( )";
    if (/(.)\1{3,}/u.test(s)) return "Enter a valid city.";
    return "";
  },

  state(v) {
    if (!v) return "Select your state.";
    if (!INDIAN_STATES.includes(v)) return "Select a valid state from the list.";
    return "";
  },

  pincode(v) {
    const s = (v ?? "").trim();
    if (!s) return "Enter your pincode.";
    if (!/^\d+$/.test(s)) return "Pincode can only contain digits.";
    if (s.length !== 6) return "Pincode must be exactly 6 digits.";
    if (!PINCODE_RE.test(s)) return "Enter a valid pincode (cannot start with 0).";
    if (/^(\d)\1{5}$/.test(s)) return "Enter a valid pincode.";
    return "";
  },
};

function validateAll(form) {
  const errs = {};
  for (const f of FIELD_ORDER) {
    const msg = validators[f](form[f]);
    if (msg) errs[f] = msg;
  }
  return errs;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

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
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
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

  // Errors are always computed live; they're only *shown* once a field
  // has been touched (blurred) or the user has tried to submit.
  const errors = useMemo(() => validateAll(form), [form]);
  const showError = (field) => (touched[field] || submitted ? errors[field] || "" : "");

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function blur(field) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  function validate() {
    if (items.length === 0) {
      setError("Your cart is empty.");
      return false;
    }
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) {
      setError("One or more items in your cart have an invalid quantity.");
      return false;
    }

    setSubmitted(true);
    const firstBad = FIELD_ORDER.find((f) => errors[f]);
    if (firstBad) {
      setError("Please fix the highlighted fields.");
      const el = document.getElementById(`field-${firstBad}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      }
      return false;
    }
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!validate()) return;

    if (!window.Razorpay) {
      setError("Payment gateway not loaded yet. Please try again.");
      return;
    }

    // Send normalized, trimmed values to the server
    const customer = {
      name: clean(form.name),
      phone: normalizePhone(form.phone),
      email: form.email.trim().toLowerCase(),
      address: clean(form.address),
      city: clean(form.city),
      state: form.state,
      pincode: form.pincode.trim(),
    };

    setLoading(true);
    try {
      // Creates the Razorpay order AND a "pending" order in our DB —
      // so it already exists (and is visible to admin) before payment
      // even starts. `items` here already includes each line's `variant`
      // (or null), which the server re-validates and re-prices.
      const orderRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer, items, shippingFee }),
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
          name: customer.name,
          contact: customer.phone,
          email: customer.email,
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
            <a
              href="/track-order"
              className="rounded-full border border-forest/30 px-8 py-3 text-sm font-semibold text-forest hover:bg-champagne"
            >
              Track Order
            </a>
            <a
              href="/products"
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
          <p className="mt-8 text-muted">
            Your cart is empty.{" "}
            <a href="/products" className="text-forest underline">
              Shop now
            </a>
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-10 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="name"
                  label="Full Name"
                  required
                  value={form.name}
                  onChange={(v) => update("name", v)}
                  onBlur={() => blur("name")}
                  error={showError("name")}
                  maxLength={60}
                  autoComplete="name"
                />
                <Field
                  id="phone"
                  label="Phone Number"
                  required
                  type="tel"
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(v) => update("phone", normalizePhone(v))}
                  onBlur={() => blur("phone")}
                  error={showError("phone")}
                  maxLength={10}
                  autoComplete="tel-national"
                  placeholder="10-digit mobile number"
                />
              </div>
              <Field
                id="email"
                label="Email (optional)"
                type="email"
                value={form.email}
                onChange={(v) => update("email", v.replace(/\s/g, ""))}
                onBlur={() => blur("email")}
                error={showError("email")}
                maxLength={254}
                autoComplete="email"
              />
              <Field
                id="address"
                label="Delivery Address"
                required
                textarea
                value={form.address}
                onChange={(v) => update("address", v)}
                onBlur={() => blur("address")}
                error={showError("address")}
                maxLength={200}
                autoComplete="street-address"
                placeholder="House/flat no., street, area, landmark"
                hint={`${clean(form.address).length}/200`}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  id="city"
                  label="City"
                  required
                  value={form.city}
                  onChange={(v) => update("city", v)}
                  onBlur={() => blur("city")}
                  error={showError("city")}
                  maxLength={50}
                  autoComplete="address-level2"
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink/70">
                    State <span className="text-terracotta">*</span>
                  </span>
                  <select
                    id="field-state"
                    required
                    value={form.state}
                    onChange={(e) => update("state", e.target.value)}
                    onBlur={() => blur("state")}
                    aria-invalid={!!showError("state")}
                    aria-describedby={showError("state") ? "err-state" : undefined}
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none focus:border-forest ${
                      showError("state") ? "border-terracotta" : "border-gold/30"
                    }`}
                  >
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {showError("state") && (
                    <span id="err-state" role="alert" className="mt-1 block text-xs text-terracotta">
                      {showError("state")}
                    </span>
                  )}
                </label>
                <Field
                  id="pincode"
                  label="Pincode"
                  required
                  inputMode="numeric"
                  value={form.pincode}
                  onChange={(v) => update("pincode", v.replace(/\D/g, "").slice(0, 6))}
                  onBlur={() => blur("pincode")}
                  error={showError("pincode")}
                  maxLength={6}
                  autoComplete="postal-code"
                />
              </div>

              <p className="text-xs text-muted">
                You&apos;ll be redirected to Razorpay&apos;s secure checkout to complete payment.
              </p>

              {error && (
                <p role="alert" className="text-sm text-terracotta">
                  {error}
                </p>
              )}
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

function Field({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  required,
  type = "text",
  textarea,
  maxLength,
  inputMode,
  autoComplete,
  placeholder,
}) {
  const common = {
    id: `field-${id}`,
    value,
    onChange: (e) => onChange(e.target.value),
    onBlur,
    maxLength,
    autoComplete,
    placeholder,
    "aria-invalid": !!error,
    "aria-describedby": error ? `err-${id}` : undefined,
    className: `w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none focus:border-forest ${
      error ? "border-terracotta" : "border-gold/30"
    }`,
  };

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink/70">
        {label} {required && <span className="text-terracotta">*</span>}
      </span>
      {textarea ? (
        <textarea {...common} rows={3} />
      ) : (
        <input {...common} type={type} inputMode={inputMode} />
      )}
      {error ? (
        <span id={`err-${id}`} role="alert" className="mt-1 block text-xs text-terracotta">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1 block text-right text-xs text-muted">{hint}</span>
      )}
    </label>
  );
}