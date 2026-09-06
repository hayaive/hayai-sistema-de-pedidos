import type React from "react"
import type { Metadata } from "next"
import "./globals.css"

/* Este cascarón de Next existe para una sola cosa: servir el mostrador.
   HAYAI vive entero en public/prototipo.html —un archivo suelto, con su
   propio CSS y su propia letra— así que aquí no hay ni tema ni tipografía
   que imponer: lo que sobrara se pelearía con las suyas. */
export const metadata: Metadata = {
  title: "HAYAI Mostrador",
  description: "Punto de venta y encargos para la panadería.",
  icons: { icon: "/icono.png", apple: "/icono.png" },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es-VE" translate="no">
      <body>{children}</body>
    </html>
  )
}
