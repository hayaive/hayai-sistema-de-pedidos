/* ═══════════════════════════════════════════════════════════════
   HAYAI Mostrador — la base de datos

   El mostrador sigue siendo dueño de sus datos: trabaja contra el
   almacén del navegador y no espera a nadie para cobrar. Esto es lo
   que hay del otro lado, para que lo cobrado no viva en un solo
   aparato: cuando hay internet, cada aparato empuja lo suyo y se trae
   lo de los demás.

   Cada colección tiene su tabla. La fila guarda el registro entero en
   `datos` —tal cual lo escribe el mostrador, sin traducir, que es lo
   que permite devolverlo sin que se pierda nada por el camino— y
   además promueve a columnas de verdad los campos con los que se
   hacen informes. Así la base se consulta con SQL corriente y no es
   una bolsa opaca de JSON.
   ═══════════════════════════════════════════════════════════════ */

import { neon } from "@neondatabase/serverless"

/* Todo pasa por aquí. Es un hueco pequeño y a propósito: en Vercel
   es Neon, y en las pruebas es un Postgres de verdad corriendo dentro
   del propio proceso. Sin esto habría que creerse que el SQL está
   bien, en vez de comprobarlo.

   La conexión se abre la primera vez que hace falta, no al cargar el
   archivo. Si faltara DATABASE_URL, abrirla al cargar tumbaría la ruta
   entera antes de poder contestar nada, y quien mirara vería un 500
   pelado en vez de «falta DATABASE_URL». */
type Cliente = { query: (texto: string, params?: unknown[]) => Promise<any> }

let cliente: Cliente | null = null

function actual(): Cliente {
  if (!cliente) {
    if (!process.env.DATABASE_URL) throw new Error("falta DATABASE_URL en el servidor")
    cliente = neon(process.env.DATABASE_URL) as unknown as Cliente
  }
  return cliente
}

export function usarCliente(c: Cliente) {
  cliente = c
  listo = null   // otro Postgres, otro esquema por crear
}

export const sql = {
  query: (texto: string, params?: unknown[]) => actual().query(texto, params),
}

/* Un campo del registro que además se guarda en su propia columna.
   `de` lo saca del JSON; si no está, va null y no pasa nada. */
type Campo = { nombre: string; tipo: string; de: (d: any) => unknown }

const fecha = (v: unknown) => {
  if (!v) return null
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? null : d
}
const texto = (v: unknown) => (v === undefined || v === null ? null : String(v))
const numero = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null)
const bool = (v: unknown) => (v === undefined || v === null ? null : !!v)

export type Coleccion = {
  tabla: string
  /* Los ids del mostrador son números y así tienen que volver: la
     interfaz los lee con Number(). La bitácora es la excepción —nunca
     tuvo id— y usa texto. */
  idTexto?: boolean
  /* La bitácora no se edita ni se borra: es el registro de lo que
     pasó. Se inserta y se deja quieta. */
  soloAlta?: boolean
  campos: Campo[]
}

export const COLECCIONES: Record<string, Coleccion> = {
  usuarios: {
    tabla: "usuarios",
    campos: [
      { nombre: "usuario", tipo: "text", de: d => texto(d.usuario) },
      { nombre: "nombre", tipo: "text", de: d => texto(d.nombre) },
      { nombre: "rol", tipo: "text", de: d => texto(d.rol) },
    ],
  },
  tiposPrecio: {
    tabla: "tipos_precio",
    campos: [{ nombre: "nombre", tipo: "text", de: d => texto(d.nombre) }],
  },
  productos: {
    tabla: "productos",
    campos: [
      { nombre: "codigo", tipo: "text", de: d => texto(d.codigo) },
      { nombre: "nombre", tipo: "text", de: d => texto(d.nombre) },
      { nombre: "categoria", tipo: "text", de: d => texto(d.categoria) },
      { nombre: "subcategoria", tipo: "text", de: d => texto(d.subcategoria) },
      { nombre: "disponible", tipo: "numeric", de: d => numero(d.disponible) },
      { nombre: "activo", tipo: "boolean", de: d => bool(d.activo) },
    ],
  },
  clientes: {
    tabla: "clientes",
    campos: [
      { nombre: "nombre", tipo: "text", de: d => texto(d.nombre) },
      { nombre: "telefono", tipo: "text", de: d => texto(d.telefono) },
      { nombre: "cedula", tipo: "text", de: d => texto(d.cedula) },
      { nombre: "zona", tipo: "text", de: d => texto(d.zona) },
    ],
  },
  pedidos: {
    tabla: "pedidos",
    campos: [
      { nombre: "cliente_id", tipo: "bigint", de: d => numero(d.clienteId) },
      { nombre: "estado", tipo: "text", de: d => texto(d.estado) },
      { nombre: "retiro", tipo: "timestamptz", de: d => fecha(d.retiro) },
      { nombre: "total", tipo: "numeric", de: d => numero(d.total) },
    ],
  },
  documentos: {
    tabla: "documentos",
    campos: [
      { nombre: "hora", tipo: "timestamptz", de: d => fecha(d.hora) },
      { nombre: "total", tipo: "numeric", de: d => numero(d.total) },
      { nombre: "anulado", tipo: "boolean", de: d => bool(d.anulado) },
      { nombre: "cajero", tipo: "text", de: d => texto(d.cajero) },
      { nombre: "tasa", tipo: "numeric", de: d => numero(d.tasa) },
    ],
  },
  bitacora: {
    tabla: "bitacora",
    idTexto: true,
    soloAlta: true,
    campos: [
      { nombre: "hora", tipo: "timestamptz", de: d => fecha(d.hora) },
      { nombre: "usuario", tipo: "text", de: d => texto(d.usuario) },
      { nombre: "texto", tipo: "text", de: d => texto(d.texto) },
    ],
  },
}

export const NOMBRES = Object.keys(COLECCIONES)

/* ── El esquema ─────────────────────────────────────────────────
   Se crea solo y se puede volver a correr sin miedo: todo va con IF
   NOT EXISTS. Se hace una vez por proceso, no en cada llamada.

   `editado` es la hora del aparato y decide quién gana cuando dos
   tocaron lo mismo. `actualizado` es la hora del servidor y es la que
   responde a «dame lo que cambió desde…»: el reloj de un mostrador no
   es de fiar, el del servidor sí.
   ──────────────────────────────────────────────────────────────── */
let listo: Promise<void> | null = null

export function asegurarEsquema() {
  if (!listo) {
    listo = crearEsquema().catch(e => {
      /* Si falló, que el siguiente intento lo vuelva a intentar en
         vez de quedarse con la promesa rota para siempre. */
      listo = null
      throw e
    })
  }
  return listo
}

async function crearEsquema() {
  for (const nombre of NOMBRES) {
    const c = COLECCIONES[nombre]
    const extra = c.campos.map(f => `, ${f.nombre} ${f.tipo}`).join("")
    await sql.query(
      `create table if not exists ${c.tabla} (
         id          ${c.idTexto ? "text" : "bigint"} primary key,
         datos       jsonb       not null,
         editado     timestamptz not null,
         actualizado timestamptz not null default now(),
         aparato     text        not null,
         borrado     boolean     not null default false
         ${extra}
       )`
    )
    /* El índice que sostiene la sincronización: «lo que cambió después
       de esta hora». Sin él, cada sincronización lee la tabla entera. */
    await sql.query(
      `create index if not exists ${c.tabla}_actualizado on ${c.tabla} (actualizado)`
    )
  }

  /* Lo que no es una lista: los datos del negocio y las tasas. Una
     fila por cosa, con la misma mecánica de fechas. */
  await sql.query(
    `create table if not exists config (
       clave       text primary key,
       datos       jsonb       not null,
       editado     timestamptz not null,
       actualizado timestamptz not null default now(),
       aparato     text        not null
     )`
  )

  /* Los aparatos. Cada uno recibe una serie —un número corto— y con
     ella numera lo que crea, para que dos mostradores trabajando cada
     uno por su lado no inventen el mismo id. */
  await sql.query(
    `create table if not exists aparatos (
       uuid    text primary key,
       serie   int  not null unique,
       nombre  text,
       creado  timestamptz not null default now(),
       visto   timestamptz not null default now()
     )`
  )
}

/* ── Guardar un registro ────────────────────────────────────────
   Gana el que editó de último. Si llega algo más viejo que lo que ya
   hay —un aparato que estuvo horas sin internet y trae una versión
   vieja del mismo cliente— se descarta: no se pisa lo nuevo con lo
   viejo.
   ──────────────────────────────────────────────────────────────── */
export async function guardarRegistro(
  nombre: string,
  fila: { id: string | number; datos: any; editado: string; borrado?: boolean },
  aparato: string
) {
  const c = COLECCIONES[nombre]
  if (!c) return

  const cols = [
    "id", "datos", "editado", "actualizado", "aparato", "borrado",
    ...c.campos.map(f => f.nombre),
  ]
  const vals: unknown[] = [
    c.idTexto ? String(fila.id) : Number(fila.id),
    JSON.stringify(fila.datos ?? {}),
    new Date(fila.editado),
    new Date(),
    aparato,
    !!fila.borrado,
    ...c.campos.map(f => f.de(fila.datos ?? {})),
  ]
  const marcas = vals.map((_, i) => `$${i + 1}`).join(", ")

  if (c.soloAlta) {
    /* La bitácora solo crece. Si la línea ya está, se deja como
       estaba: reescribirla sería falsear lo que pasó. */
    await sql.query(
      `insert into ${c.tabla} (${cols.join(", ")}) values (${marcas})
       on conflict (id) do nothing`,
      vals
    )
    return
  }

  const pisa = cols
    .filter(x => x !== "id")
    .map(x => `${x} = excluded.${x}`)
    .join(", ")

  await sql.query(
    `insert into ${c.tabla} (${cols.join(", ")}) values (${marcas})
     on conflict (id) do update set ${pisa}
     where ${c.tabla}.editado <= excluded.editado`,
    vals
  )
}

/* Lo que cambió después de `desde`. Si `desde` viene vacío se lleva
   todo: es un aparato que empieza de cero o que se reinstaló.

   En una sincronización corriente no se le devuelve a un aparato lo
   que él mismo mandó: ya lo tiene, y devolvérselo podría pisarle algo
   que acaba de escribir mientras la petición iba en camino. */
export async function traerCambios(nombre: string, desde: string | null, aparato: string) {
  const c = COLECCIONES[nombre]
  if (!c) return []

  if (!desde) {
    return (await sql.query(
      `select id, datos, editado, borrado from ${c.tabla}
        order by actualizado asc limit 20000`
    )) as any[]
  }
  /* El corte va con «mayor o igual», no con «mayor». La marca y la
     hora de escritura se toman las dos del reloj del servidor y en un
     ida y vuelta rápido caen en el mismo milisegundo: con «mayor», ese
     registro no lo pediría nunca más nadie. Con «igual» incluido, a lo
     sumo llega dos veces, y aplicarlo dos veces da lo mismo. */
  return (await sql.query(
    `select id, datos, editado, borrado from ${c.tabla}
      where actualizado >= $1 and aparato <> $2
      order by actualizado asc limit 20000`,
    [new Date(desde), aparato]
  )) as any[]
}

/* ¿Está vacía la base? Decide si el primer aparato que llegue siembra
   lo suyo o si tiene que traerse lo que ya hay. */
export async function baseVacia() {
  for (const nombre of NOMBRES) {
    const filas = (await sql.query(
      `select 1 from ${COLECCIONES[nombre].tabla} limit 1`
    )) as any[]
    if (filas.length) return false
  }
  return true
}
