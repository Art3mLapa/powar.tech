import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const bebas = localFont({ src: "../assets/bebas-neue-cyrillic.ttf", variable: "--font-bebas", display: "swap", weight: "400" });
export const metadata: Metadata = {
  title: "БИЛДЕРС СЗ ПРОДАКШН — UNDERГРАУНД STAЛZОНА",
  description: "Самые отбитые панки в зоне. Подвал Билдеров, видео и андерграунд Сталзона.",
  openGraph: { title: "БИЛДЕРС СЗ ПРОДАКШН", description: "UNDERГРАУНД STAЛZОНА", locale: "ru_RU", type: "website" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" className={bebas.variable}><body>{children}</body></html>;
}
