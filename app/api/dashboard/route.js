import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Category from "@/models/Category";

// Only paid, non-cancelled orders count toward sales figures
const PAID_ACTIVE = { paymentStatus: "paid", status: { $ne: "cancelled" } };

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET() {
  try {
    await connectDB();

    const today = startOfDay(new Date());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 29);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

    const [todayOrders, weekOrders, monthOrders, pendingOrders, totalProducts, totalCategories, lowStock, last14] =
      await Promise.all([
        Order.find({ ...PAID_ACTIVE, createdAt: { $gte: today } }),
        Order.find({ ...PAID_ACTIVE, createdAt: { $gte: weekAgo } }),
        Order.find({ ...PAID_ACTIVE, createdAt: { $gte: monthAgo } }),
        // Paid orders still waiting for action
        Order.countDocuments({ paymentStatus: "paid", status: { $in: ["pending", "confirmed"] } }),
        Product.countDocuments(),
        Category.countDocuments(),
        Product.find({ $expr: { $lte: ["$stock", "$lowStockThreshold"] } })
          .select("name stock lowStockThreshold images")
          .limit(10),
        Order.find({ ...PAID_ACTIVE, createdAt: { $gte: fourteenDaysAgo } }).select("createdAt total"),
      ]);

    const sum = (arr) => arr.reduce((acc, o) => acc + o.total, 0);

    // Build 14-day sales trend
    const trendMap = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo);
      d.setDate(d.getDate() + i);
      const key = `${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
      trendMap[key] = 0;
    }
    for (const o of last14) {
      const d = new Date(o.createdAt);
      const key = `${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
      if (trendMap[key] !== undefined) trendMap[key] += o.total;
    }
    const salesTrend = Object.entries(trendMap).map(([date, total]) => ({ date, total }));

    // Top selling products (by quantity across all paid, non-cancelled orders)
    const allOrders = await Order.find(PAID_ACTIVE).select("items");
    const productTotals = {};
    for (const order of allOrders) {
      for (const item of order.items) {
        const key = item.name;
        productTotals[key] = (productTotals[key] || 0) + item.quantity;
      }
    }
    const topSelling = Object.entries(productTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    return NextResponse.json({
      todaySales: sum(todayOrders),
      todayOrderCount: todayOrders.length,
      weekSales: sum(weekOrders),
      weekOrderCount: weekOrders.length,
      monthSales: sum(monthOrders),
      monthOrderCount: monthOrders.length,
      pendingOrders,
      totalProducts,
      totalCategories,
      lowStock,
      salesTrend,
      topSelling,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load dashboard." }, { status: 500 });
  }
}