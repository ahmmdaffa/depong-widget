import type { Metadata } from "next";
import AdminDashboard from "@/components/AdminDashboard";

export const metadata: Metadata = {
  title: "Admin Dashboard — Depong",
  description: "Pantau daftar pengguna yang membuat akun dan statistik momen di Depong.",
};

export default function AdminPage() {
  return <AdminDashboard />;
}
