import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "../components/Sidebar";

export const metadata: Metadata = {
  title: "Brasaland Backoffice",
  description: "Internal dashboard for Brasaland restaurant chain operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="ml-64 flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
