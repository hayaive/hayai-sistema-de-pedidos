/* ¿Está viva la base? Sirve para probar el despliegue sin tener que
   abrir el mostrador y ponerse a vender. No pide llave: no dice nada
   del negocio, solo si el otro lado contesta. */

import { sql, asegurarEsquema } from "@/lib/db"
import { json } from "@/lib/puerta"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const hayLlave = !!process.env.HAYAI_TOKEN
  const hayBase = !!process.env.DATABASE_URL

  if (!hayBase) return json({ ok: false, base: false, llave: hayLlave, error: "falta DATABASE_URL" }, 500)

  try {
    await asegurarEsquema()
    await sql.query("select 1")
    return json({ ok: true, base: true, llave: hayLlave, ahora: new Date().toISOString() })
  } catch (e: any) {
    return json({ ok: false, base: false, llave: hayLlave, error: String(e?.message || e) }, 500)
  }
}
