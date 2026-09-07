/* ═══════════════════════════════════════════════════════════════
   La sincronización

   Una sola ida y vuelta: el aparato manda lo que cambió desde la
   última vez y se lleva lo que cambiaron los demás. No hay nada que
   esperar del otro lado para poder cobrar —el mostrador ya cobró—;
   esto es lo que hace que lo cobrado aquí aparezca allá.

   El orden importa:

   1. Se toma la hora del servidor ANTES de escribir nada. Esa hora es
      la que se devuelve como marca. Si se tomara al final, lo que
      otro aparato escribiera mientras esta petición va y viene se
      quedaría en tierra de nadie y no lo pediría nunca más.
   2. Se aplica lo que trae, registro por registro. Gana el que editó
      de último (lo resuelve guardarRegistro).
   3. Se devuelve lo que cambió después de su marca anterior.

   Que la marca se solape un poco no rompe nada: puede llegar dos
   veces el mismo registro, y aplicarlo dos veces da lo mismo. Perder
   uno sí rompería.
   ═══════════════════════════════════════════════════════════════ */

import { sql, asegurarEsquema, guardarRegistro, traerCambios, baseVacia, NOMBRES } from "@/lib/db"
import { pasa, json, noPasa } from "@/lib/puerta"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/* Un empujón no debería traer más que esto. Si lo hace, es un error
   en algún lado y es mejor cortarlo que llenar la base. */
const TOPE_POR_COLECCION = 5000

const CONFIG = ["negocio", "tasas"]

export async function POST(req: Request) {
  if (!pasa(req)) return noPasa()

  let cuerpo: any
  try { cuerpo = await req.json() } catch { return json({ ok: false, error: "cuerpo ilegible" }, 400) }

  const aparato = String(cuerpo?.aparato || "").slice(0, 64)
  if (!aparato) return json({ ok: false, error: "falta aparato" }, 400)

  const desde: string | null = cuerpo?.desde ? String(cuerpo.desde) : null
  const cambios = (cuerpo?.cambios && typeof cuerpo.cambios === "object") ? cuerpo.cambios : {}
  const config = (cuerpo?.config && typeof cuerpo.config === "object") ? cuerpo.config : {}

  try {
    await asegurarEsquema()

    /* Paso 1: la hora, antes de tocar nada. */
    const ahora = new Date()

    /* Solo en el primer contacto hace falta saber si la base está
       estrenándose: es quien decide si este aparato siembra lo suyo o
       se trae lo que ya hay. */
    const vacia = desde ? false : await baseVacia()

    /* Paso 2: lo que trae. */
    let escritos = 0
    for (const nombre of NOMBRES) {
      const filas = cambios[nombre]
      if (!Array.isArray(filas) || !filas.length) continue
      if (filas.length > TOPE_POR_COLECCION) {
        return json({ ok: false, error: `demasiadas filas en ${nombre}` }, 413)
      }
      for (const f of filas) {
        if (!f || f.id === undefined || f.id === null) continue
        await guardarRegistro(
          nombre,
          {
            id: f.id,
            datos: f.datos ?? {},
            /* Sin hora del aparato no hay con qué desempatar: se toma
               la de ahora y que gane, que para eso acaba de llegar. */
            editado: f.editado || ahora.toISOString(),
            borrado: !!f.borrado,
          },
          aparato
        )
        escritos++
      }
    }

    for (const clave of CONFIG) {
      const c = config[clave]
      if (!c || typeof c !== "object" || c.datos === undefined) continue
      await sql.query(
        `insert into config (clave, datos, editado, actualizado, aparato)
         values ($1, $2, $3, $4, $5)
         on conflict (clave) do update
           set datos = excluded.datos, editado = excluded.editado,
               actualizado = excluded.actualizado, aparato = excluded.aparato
         where config.editado <= excluded.editado`,
        [clave, JSON.stringify(c.datos), new Date(c.editado || ahora.toISOString()), new Date(), aparato]
      )
      escritos++
    }

    /* Paso 3: lo que se lleva. */
    const devuelve: Record<string, any[]> = {}
    let recibidos = 0
    for (const nombre of NOMBRES) {
      const filas = await traerCambios(nombre, desde, aparato)
      if (filas.length) { devuelve[nombre] = filas; recibidos += filas.length }
    }

    const filasConfig = desde
      ? await sql.query(
          `select clave, datos, editado from config
            where actualizado >= $1 and aparato <> $2`,
          [new Date(desde), aparato]
        )
      : await sql.query("select clave, datos, editado from config")
    const devuelveConfig: Record<string, any> = {}
    for (const f of filasConfig as any[]) devuelveConfig[f.clave] = { datos: f.datos, editado: f.editado }

    /* Que se sepa cuándo pasó por última vez cada aparato: es lo que
       después contesta «este mostrador lleva dos días sin sincronizar». */
    await sql.query("update aparatos set visto = now() where uuid = $1", [aparato])

    return json({
      ok: true,
      ahora: ahora.toISOString(),
      vacia,
      escritos,
      recibidos,
      cambios: devuelve,
      config: devuelveConfig,
    })
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500)
  }
}
