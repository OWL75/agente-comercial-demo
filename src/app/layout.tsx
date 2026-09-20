import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="es">
      <body className="min-h-screen bg-[#05070d] text-slate-200 antialiased">{children}</body>
    </html>
  );
}
