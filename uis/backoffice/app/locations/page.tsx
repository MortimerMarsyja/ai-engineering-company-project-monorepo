"use client";

import { locations, generateDailySales, getRevenueByLocation } from "../../lib/data";
import styles from "./locations.module.css";

export default function LocationsPage() {
  const sales = generateDailySales();
  const revenueByLocation = getRevenueByLocation(sales);

  // Aggregate orders per location
  const ordersByLocation: Record<string, number> = {};
  for (const sale of sales) {
    if (!ordersByLocation[sale.locationId]) ordersByLocation[sale.locationId] = 0;
    ordersByLocation[sale.locationId] += sale.orders;
  }

  const colombiaLocations = locations.filter((l) => l.country === "Colombia");
  const usLocations = locations.filter((l) => l.country === "United States");

  function renderLocationCard(location: (typeof locations)[0]) {
    const revenue = revenueByLocation[location.id] || 0;
    const orders = ordersByLocation[location.id] || 0;
    const avgTicket = orders > 0 ? Math.round(revenue / orders) : 0;

    return (
      <div
        key={location.id}
        className={`${styles.card} rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md`}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-semibold text-gray-900">{location.name}</h4>
            <p className="mt-0.5 text-xs text-gray-400">{location.city}</p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              location.country === "Colombia"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {location.country === "Colombia" ? "🇨🇴" : "🇺🇸"} {location.country === "Colombia" ? "COL" : "US"}
          </span>
        </div>

        <div className={`${styles.metrics} mb-3 text-center`}>
          <div className="min-w-0 rounded-lg bg-gray-50 p-2">
            <p className={`${styles.value} font-bold text-gray-900`}>${(revenue / 1000).toFixed(1)}k</p>
            <p className="whitespace-nowrap text-[10px] text-gray-400">Revenue</p>
          </div>
          <div className="min-w-0 rounded-lg bg-gray-50 p-2">
            <p className={`${styles.value} font-bold text-gray-900`}>{orders}</p>
            <p className="whitespace-nowrap text-[10px] text-gray-400">Orders</p>
          </div>
          <div className="min-w-0 rounded-lg bg-gray-50 p-2">
            <p className={`${styles.value} font-bold text-gray-900`}>${avgTicket}</p>
            <p className="whitespace-nowrap text-[10px] text-gray-400">Avg Ticket</p>
          </div>
        </div>

        <div className={`${styles.details} text-xs text-gray-500`}>
          <p>📍 {location.address}</p>
          <p>📞 {location.phone}</p>
          <p>👤 {location.manager} · {location.employees} staff</p>
          <p>🗓 Since {location.openingYear}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
        <p className="text-sm text-gray-500">
          Performance overview for all {locations.length} Brasaland restaurants
        </p>
      </div>

      {/* Colombia */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xl">🇨🇴</span>
          <h2 className="text-lg font-semibold text-gray-900">
            Colombia ({colombiaLocations.length} locations)
          </h2>
        </div>
        <div className={styles.grid}>
          {colombiaLocations.map(renderLocationCard)}
        </div>
      </section>

      {/* United States */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xl">🇺🇸</span>
          <h2 className="text-lg font-semibold text-gray-900">
            United States ({usLocations.length} locations)
          </h2>
        </div>
        <div className={styles.grid}>
          {usLocations.map(renderLocationCard)}
        </div>
      </section>
    </div>
  );
}
