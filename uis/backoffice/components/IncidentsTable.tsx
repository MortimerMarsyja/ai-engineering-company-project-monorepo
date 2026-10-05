"use client";

import Link from "next/link";
import Badge from "./Badge";
import {
  CATEGORY_LABELS,
  ORIGIN_LABELS,
  STATUS_COLORS,
  STATUS_ICONS,
  STATUS_LABELS,
  type Incident,
} from "@/lib/incidents";

interface IncidentsTableProps {
  incidents: Incident[];
}

export default function IncidentsTable({ incidents }: IncidentsTableProps) {
  if (incidents.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <span className="text-4xl">📭</span>
        <p className="mt-4 text-sm font-medium text-gray-500">No incidents match these filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Title</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Category</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Origin</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Branch</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Logged</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {incidents.map((incident) => (
            <tr key={incident.id} className="hover:bg-gray-50">
              <td className="max-w-xs truncate px-4 py-3">
                <Link
                  href={`/incidents/${incident.id}`}
                  className="font-medium text-gray-900 hover:text-brasa-red"
                  title={incident.title}
                >
                  {incident.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-600">
                {CATEGORY_LABELS[incident.category] ?? incident.category}
              </td>
              <td className="px-4 py-3">
                <Badge
                  label={STATUS_LABELS[incident.status]}
                  className={`border ${STATUS_COLORS[incident.status]}`}
                >
                  {STATUS_ICONS[incident.status]} {STATUS_LABELS[incident.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-gray-600">{ORIGIN_LABELS[incident.origin]}</td>
              <td className="px-4 py-3 text-gray-600">{incident.branch}</td>
              <td className="px-4 py-3 whitespace-nowrap text-gray-400">
                {new Date(incident.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
