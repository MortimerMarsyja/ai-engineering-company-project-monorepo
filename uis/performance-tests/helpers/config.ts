export const config = {
  webBaseUrl: process.env.WEB_BASE_URL ?? "http://localhost:3000",
  backofficeBaseUrl: process.env.BACKOFFICE_BASE_URL ?? "http://localhost:3001",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@brasaland.com",
  adminPassword: process.env.ADMIN_PASSWORD ?? "Admin123!",
  reportsDir: process.env.REPORTS_DIR ?? "reports",
};
