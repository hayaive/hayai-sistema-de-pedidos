import { redirect } from "next/navigation"

/* La raíz es el mostrador, no la plantilla.
   prototipo.html vive en public/, así que se sirve tal cual en /prototipo.html:
   es un archivo suelto, sin pasar por React ni por el build de Next.
   El tablero de v0 con el que se armó este proyecto quedó en /demo. */
export default function Home() {
  redirect("/prototipo.html")
}
