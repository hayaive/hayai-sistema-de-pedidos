/* ═══════════════════════════════════════════════════════════════
   Darle nombre y número a un aparato

   Cada mostrador, tableta o teléfono recibe una serie: un número
   corto, del 1 al 99. Con esa serie numera todo lo que crea, y por
   eso dos aparatos que estuvieron trabajando cada uno por su lado no
   inventan el mismo id para clientes distintos.

   El aparato propone la suya —se la inventó al instalarse, para poder
   trabajar sin internet desde el primer minuto— y aquí se le respeta
   si está libre. Si ya la tiene otro, se le da la más baja que quede:
   lo que haya creado antes conserva su numeración y sigue siendo
   suyo.
   ═══════════════════════════════════════════════════════════════ */

import { sql, asegurarEsquema } from "@/lib/db"
import { pasa, json, noPasa } from "@/lib/puerta"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DESDE = 10   // dos dígitos siempre: el número de ticket queda parejo
const TOPE  = 99

export async function POST(req: Request) {
  if (!pasa(req)) return noPasa()

  let cuerpo: any
  try { cuerpo = await req.json() } catch { return json({ ok: false, error: "cuerpo ilegible" }, 400) }

  const uuid = String(cuerpo?.uuid || "").slice(0, 64)
  if (!uuid) return json({ ok: false, error: "falta uuid" }, 400)
  const nombre = cuerpo?.nombre ? String(cuerpo.nombre).slice(0, 80) : null
  const propuesta = Number(cuerpo?.serie)

  try {
    await asegurarEsquema()

    /* Si ya se conoce, no se le cambia la serie por nada del mundo:
       todo lo que creó cuelga de ella. */
    const ya = (await sql.query("select serie from aparatos where uuid = $1", [uuid])) as any[]
    if (ya.length) {
      await sql.query(
        "update aparatos set visto = now(), nombre = coalesce($2, nombre) where uuid = $1",
        [uuid, nombre]
      )
      return json({ ok: true, serie: Number(ya[0].serie), nueva: false })
    }

    const quiere = Number.isInteger(propuesta) && propuesta >= DESDE && propuesta <= TOPE ? propuesta : null
    const intentos = quiere ? [quiere] : []

    /* Su propuesta primero; después, las libres de abajo hacia arriba.
       Se reintenta porque dos aparatos estrenándose a la vez pueden
       calcular el mismo hueco. */
    for (let i = 0; i < 5; i++) {
      let serie = intentos.shift()
      if (serie === undefined) {
        const libre = (await sql.query(
          `select min(s) as s from generate_series(${DESDE}, ${TOPE}) s
            where s not in (select serie from aparatos)`
        )) as any[]
        serie = libre[0]?.s == null ? undefined : Number(libre[0].s)
      }
      if (serie === undefined) {
        return json({ ok: false, error: "no quedan series libres" }, 409)
      }
      try {
        await sql.query(
          "insert into aparatos (uuid, serie, nombre) values ($1, $2, $3)",
          [uuid, serie, nombre]
        )
        return json({ ok: true, serie, nueva: true })
      } catch (e: any) {
        /* 23505 = ya la tomaron entre medias. Se busca otra. */
        if (e?.code !== "23505") throw e
      }
    }
    return json({ ok: false, error: "no se pudo asignar serie" }, 409)
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500)
  }
}
