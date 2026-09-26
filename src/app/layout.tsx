import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Agente Comercial Autónomo | SISTECOMP",
    template: "%s | SISTECOMP",
  },
  description:
    "Demo del Agente Comercial Autónomo de Nova Distribution — detecta oportunidades, conversa por WhatsApp y negocia dentro de reglas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-ink-950 font-sans text-slate-200 antialiased">{children}</body>
    </html>
  );
}
