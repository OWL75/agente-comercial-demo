import type { Metadata } from "next";
import { agentWhatsAppDigits, waLink } from "@/lib/channel/whatsapp-number";
import { FOUNDER_OFFER, usd } from "@/lib/prospect/offer";
import { founderSlotsLeft } from "@/lib/prospect/signup";
import { SignupForm } from "./signup-form";
import {
  IconCard,
  IconChat,
  IconCheck,
  IconRadar,
  IconShield,
  IconSliders,
  IconSpark,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fernán — Agente comercial con IA",
  description: "Recupere a los clientes que dejaron de comprarle: Fernán los detecta, les escribe por WhatsApp, negocia dentro de sus reglas y cobra.",
};

const STEPS = [
  { icon: IconRadar, title: "Detecta", text: "Revisa el historial de compras y marca a los clientes que llevan más tiempo del habitual sin pedir, con lo que vale recuperarlos." },
  { icon: IconChat, title: "Conversa", text: "Les escribe por WhatsApp como su mejor vendedor: recuerda su último pedido, averigua por qué dejaron de comprar y responde a cualquier hora." },
  { icon: IconSliders, title: "Negocia con sus reglas", text: "Mejora el precio solo hasta donde usted autoriza. Lo que se sale de las reglas le llega a usted por Telegram y lo decide con un botón." },
  { icon: IconCard, title: "Cierra y cobra", text: "Con el «sí» del cliente crea el pedido y le envía el enlace de pago. Si no paga, le recuerda antes y después del vencimiento." },
];

const INCLUDED = [
  "Fernán configurado con sus productos, precios y reglas de descuento",
  "Carga de sus clientes e historial de compras (desde Excel o su sistema)",
  "Panel en vivo con oportunidades, conversaciones y ventas",
  "Aprobaciones del gerente por Telegram con un botón",
  "Cobro con enlace de pago y recordatorios de vencimiento",
  "Seguimientos automáticos cuando el cliente no responde",
];

const FAQ = [
  {
    q: "¿Necesito una reunión para empezar?",
    a: "No. Pruebe a Fernán por WhatsApp, reserve su cupo aquí y le escribimos para coordinar la implementación.",
  },
  {
    q: "¿Cómo se conecta con mis datos?",
    a: "Para arrancar, con una exportación en Excel de sus clientes, productos e historial de compras. Después se puede conectar en solo lectura con su sistema. Fernán lee sus datos; no modifica su ERP.",
  },
  {
    q: "¿Qué pasa después de pagar?",
    a: "Llena el registro de esta página, verificamos su pago y le escribimos por WhatsApp para pedirle sus datos y configurar a Fernán con sus reglas.",
  },
  {
    q: "¿Hay costos adicionales?",
    a: "Los mensajes de WhatsApp que cobra Meta se facturan aparte, al costo. No hay contrato de permanencia.",
  },
  {
    q: "¿Y si no me funciona?",
    a: `Si en ${FOUNDER_OFFER.guaranteeDays} días Fernán no le cierra ventas por al menos lo que pagó de mensualidad, le devolvemos la mensualidad.`,
  },
];

/** "paypal.me/x" or a full URL → https URL; anything else is ignored. */
function paypalLink(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(url);
    return /(^|\.)paypal\.(me|com)$/i.test(parsed.hostname) ? parsed.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

function TryButton({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="btn btn-primary">
      <IconChat className="h-4 w-4" /> Pruébelo ahora por WhatsApp
    </a>
  );
}

export default async function FernanPage() {
  const [digits, slotsLeft] = await Promise.all([agentWhatsAppDigits(), founderSlotsLeft()]);
  const demoLink = digits ? waLink(digits, "DEMO") : null;
  const paypal = paypalLink(process.env.PAYPAL_PAYMENT_URL);
  const yappy = process.env.YAPPY_DIRECTORY?.trim() || null;
  const contact = (process.env.CONTACT_WHATSAPP ?? "").replace(/\D/g, "") || null;
  const loom = process.env.LOOM_EMBED_URL?.trim() || null;
  const founder = slotsLeft > 0;
  const setup = founder ? FOUNDER_OFFER.setup.founder : FOUNDER_OFFER.setup.list;
  // A paypal.me link opens with the amount already filled in.
  const paypalHref = paypal && /paypal\.me\//i.test(paypal) ? `${paypal.replace(/\/+$/, "")}/${setup}USD` : paypal;
  const monthly = founder ? FOUNDER_OFFER.monthly.founder : FOUNDER_OFFER.monthly.list;

  return (
    <main className="app-backdrop min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-300 via-cyan-400 to-indigo-500 text-slate-950">
            <IconSpark className="h-[18px] w-[18px]" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-white">Fernán</span>
            <span className="block text-[11px] text-slate-500">Agente comercial con IA · SISTECOMP</span>
          </span>
        </div>
        <a href="#precio" className="btn btn-secondary !py-2 text-xs">Ver precio</a>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-fade-up">
            <p className="eyebrow text-teal-300/80">Para distribuidoras y negocios B2B</p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
              Recupere a los clientes que <span className="text-gradient">dejaron de comprarle</span>, en automático.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300">
              Fernán los detecta, les escribe por WhatsApp, negocia sin regalar su margen y deja la venta cobrada. Usted solo
              decide lo que se sale de sus reglas, con un botón.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <TryButton href={demoLink} />
              <a href="#precio" className="btn btn-secondary">Precio de fundador: 50% menos</a>
            </div>
            {demoLink && (
              <p className="mt-3 text-xs text-slate-500">
                Se abre WhatsApp con el mensaje «DEMO». Envíelo y Fernán le venderá a usted, en vivo.
              </p>
            )}
          </div>
          <div className="surface overflow-hidden p-0">
            {loom ? (
              <div className="relative aspect-video">
                <iframe src={loom} title="Demo de Fernán" allowFullScreen className="absolute inset-0 h-full w-full" />
              </div>
            ) : (
              <div className="chat-wallpaper space-y-2 p-5">
                {[
                  ["agent", "Hola, le escribe Fernán de Nova Distribution. Su último pedido fue de 50 unidades de Shampoo Professional 1L, hace 6 semanas. ¿Le preparo la misma cantidad para esta semana?"],
                  ["customer", "Cambiamos de proveedor, nos dan mejor precio"],
                  ["agent", "Entiendo. ¿Qué precio le ofrece su proveedor actual?"],
                  ["customer", "17.75"],
                  ["agent", "Se lo puedo dejar en $17.65 por unidad, con entrega al día siguiente y crédito a 30 días. ¿Se lo dejo listo?"],
                  ["customer", "Sí"],
                ].map(([who, text], i) => (
                  <div key={i} className={`flex ${who === "agent" ? "justify-end" : "justify-start"}`}>
                    <p
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                        who === "agent" ? "bg-gradient-to-br from-teal-600 to-teal-700 text-white" : "bg-[#1b2433] text-slate-100"
                      }`}
                    >
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Cómo vende Fernán</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="surface p-5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-400/10 text-teal-300 ring-1 ring-inset ring-teal-400/20">
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-4 text-sm font-semibold text-white">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-center">
          <TryButton href={demoLink} />
        </div>
      </section>

      {/* Pricing */}
      <section id="precio" className="mx-auto max-w-6xl scroll-mt-6 px-5 pb-16 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="surface relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl" />
            <div className="relative flex flex-wrap items-center gap-2">
              {founder ? (
                <>
                  <span className="chip bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-400/30">Precio de fundador · 50% menos</span>
                  <span className="chip bg-white/[0.05] text-slate-300 ring-1 ring-inset ring-white/10">
                    Quedan {slotsLeft} de {FOUNDER_OFFER.slots} cupos
                  </span>
                </>
              ) : (
                <span className="chip bg-white/[0.05] text-slate-300 ring-1 ring-inset ring-white/10">Cupos de fundador agotados</span>
              )}
            </div>
            <div className="relative mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-400">Implementación (pago único)</p>
                {founder && <p className="mt-1 text-lg text-slate-500 line-through tabular-nums">{usd(FOUNDER_OFFER.setup.list)}</p>}
                <p className="text-4xl font-semibold tracking-tight text-white tabular-nums">{usd(setup)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Mensualidad</p>
                {founder && <p className="mt-1 text-lg text-slate-500 line-through tabular-nums">{usd(FOUNDER_OFFER.monthly.list)}/mes</p>}
                <p className="text-4xl font-semibold tracking-tight text-white tabular-nums">
                  {usd(monthly)}
                  <span className="text-base font-normal text-slate-400">/mes</span>
                </p>
                {founder && <p className="mt-1 text-xs text-teal-300">Precio fijo por {FOUNDER_OFFER.monthly.months} meses</p>}
              </div>
            </div>
            <ul className="relative mt-6 space-y-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-slate-300">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" /> {item}
                </li>
              ))}
            </ul>
            <div className="relative mt-6 flex gap-3 rounded-xl bg-emerald-400/[0.07] p-4 ring-1 ring-inset ring-emerald-400/20">
              <IconShield className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              <p className="text-sm leading-relaxed text-slate-200">
                <span className="font-semibold text-white">Garantía de {FOUNDER_OFFER.guaranteeDays} días.</span> Si Fernán no le cierra
                ventas por al menos lo que pagó de mensualidad, le devolvemos la mensualidad.
              </p>
            </div>
            {founder && (
              <p className="relative mt-4 text-xs leading-relaxed text-slate-500">
                Solo {FOUNDER_OFFER.slots} cupos porque cada implementación la hacemos personalmente. Los mensajes de WhatsApp que cobra
                Meta se facturan aparte, al costo. Sin contrato de permanencia.
              </p>
            )}
          </div>

          <div className="surface p-6 sm:p-8">
            <p className="text-lg font-semibold text-white">Actívelo hoy</p>
            <p className="mt-1 text-sm text-slate-400">
              1. Pague la implementación ({usd(setup)}). 2. Llene el registro. 3. Le escribimos para configurar a Fernán con sus datos.
            </p>
            <div className="mt-5 space-y-3">
              {paypal ? (
                <div>
                  <a href={paypalHref ?? paypal} target="_blank" rel="noreferrer" className="btn w-full bg-[#ffc439] text-slate-950 hover:brightness-105">
                    Pagar {usd(setup)} con PayPal
                  </a>
                  <p className="mt-1.5 text-center text-[11px] text-slate-500">Con su saldo de PayPal o una tarjeta de crédito o débito vinculada.</p>
                </div>
              ) : (
                <p className="rounded-xl bg-white/[0.04] px-4 py-3 text-sm text-slate-400 ring-1 ring-inset ring-white/[0.06]">PayPal: disponible muy pronto.</p>
              )}
              {yappy ? (
                <div className="rounded-xl bg-white/[0.04] px-4 py-3 ring-1 ring-inset ring-white/[0.08]">
                  <p className="text-sm font-semibold text-white">Pagar con Yappy</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {/^[\d\s+()-]+$/.test(yappy) ? "Envíe" : "En Yappy, busque"} <span className="font-semibold text-white">{yappy}</span>{/^[\d\s+()-]+$/.test(yappy) ? ` por Yappy ${usd(setup)}` : ` y envíe ${usd(setup)}`} con el nombre de su empresa en la descripción.
                  </p>
                </div>
              ) : (
                <p className="rounded-xl bg-white/[0.04] px-4 py-3 text-sm text-slate-400 ring-1 ring-inset ring-white/[0.06]">Yappy: disponible muy pronto.</p>
              )}
            </div>
            <div className="mt-6 border-t border-white/[0.06] pt-5">
              <p className="mb-3 text-sm font-semibold text-white">{founder ? "Ya pagué: reservar mi cupo" : "Lista de espera"}</p>
              <SignupForm founder={founder} />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Preguntas frecuentes</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="surface group p-5">
              <summary className="cursor-pointer list-none text-sm font-semibold text-white">{q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{a}</p>
            </details>
          ))}
          <div className="surface p-5">
            <p className="text-sm font-semibold text-white">¿Prefiere hablar con una persona?</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Atendemos sábados y domingos de 8:00 a. m. a 4:00 p. m.
              {contact ? (
                <>
                  {" "}
                  <a href={waLink(contact, "Hola, vi a Fernán y quiero hablar con alguien.")} target="_blank" rel="noreferrer" className="font-medium text-teal-300 hover:text-teal-200">
                    Escríbanos por WhatsApp
                  </a>
                  .
                </>
              ) : null}
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-slate-500">
        Fernán · Agente comercial con IA · SISTECOMP
      </footer>
    </main>
  );
}
