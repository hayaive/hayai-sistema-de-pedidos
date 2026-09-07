/* ═══════════════════════════════════════════════════════════════
   Prueba de la sincronización, de punta a punta

   No hay nada simulado a los lados: el Postgres es un Postgres de
   verdad (el mismo motor, compilado a WASM y corriendo dentro de este
   proceso), las rutas del API son las que se despliegan, y el motor
   del cliente es el que está escrito dentro de prototipo.html —se
   recorta del propio archivo y se ejecuta tal cual—.

   Lo único de mentira son los alrededores del navegador: el almacén
   local, el reloj y el fetch, que aquí en vez de salir a la red llama
   directamente a las rutas.

   Correr con:  npx tsx test/sincronizacion.test.ts
   ═══════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { usarCliente } from "@/lib/db"

process.env.HAYAI_TOKEN = "llave-de-prueba"
/* No se usa para conectarse —el cliente va enchufado abajo—, pero las
   rutas comprueban que exista antes de contestar, igual que en Vercel. */
process.env.DATABASE_URL = "postgres://prueba/en-memoria"

const pg = new PGlite()
usarCliente({
  query: async (texto: string, params?: unknown[]) =>
    (await pg.query(texto, (params as any[]) || [])).rows,
})

/* Las rutas se cargan después de enchufar el Postgres de prueba. */
const { POST: rutaSync } = await import("@/app/api/sync/route")
const { POST: rutaAparato } = await import("@/app/api/aparato/route")
const { GET: rutaSalud } = await import("@/app/api/salud/route")

/* ── El marcador ────────────────────────────────────────────────── */
let bien = 0, mal = 0
const fallos: string[] = []

function vale(que: string, cond: boolean, detalle = "") {
  if (cond) { bien++; console.log("  ok   " + que) }
  else { mal++; fallos.push(que + (detalle ? " — " + detalle : "")); console.log("  MAL  " + que + (detalle ? " — " + detalle : "")) }
}
const igual = (que: string, a: unknown, b: unknown) =>
  vale(que, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, vino ${JSON.stringify(a)}`)

/* ── El motor del cliente, recortado de prototipo.html ───────────── */
const html = readFileSync("public/prototipo.html", "utf8").split("\n")
const inicio = html.findIndex(l => l.trim() === "SINCRONIZAR") - 1
const fin = html.findIndex((l, i) => i > inicio && l.startsWith("/* ── Notificaciones"))
if (inicio < 1 || fin < 0) throw new Error("no se encontró el bloque SINCRONIZAR en prototipo.html")
const bloqueCrudo = html.slice(inicio, fin).join("\n")
console.log(`\nMotor del cliente: ${fin - inicio} líneas recortadas de prototipo.html\n`)

/* La llave viene vacía en el archivo (sin servidor, el mostrador
   trabaja solo). Para probar hace falta una. */
const bloque = bloqueCrudo.replace('const LLAVE_API = "";', 'const LLAVE_API = "llave-de-prueba";')
if (bloque === bloqueCrudo) throw new Error("no se pudo poner la llave de prueba")

/* ── Un mostrador: su estado, su almacén y su motor ──────────────── */
type Mostrador = ReturnType<typeof abrirMostrador>

function estadoNuevo() {
  return {
    usuario: { id: 1, nombre: "Ana Delgado", rol: "duena" },
    ventana: null as unknown,
    enLinea: true,
    negocio: { nombre: "Panadería y Pastelería", rif: "J-40123456-7", direccion: "Av. Bolívar, local 4", logo: null },
    usuarios: [{ id: 1, nombre: "Ana Delgado", usuario: "ana", clave: "1234", rol: "duena", iniciales: "AD" }],
    tiposPrecio: [{ id: 1, nombre: "Detal" }, { id: 2, nombre: "Mayor" }],
    productos: [
      { id: 1, codigo: "PAS-001", nombre: "tres-leches", categoria: "Pastelería", precios: { 1: 1.2, 2: 1.1 }, disponible: 0, minimo: 0, activo: true },
      { id: 2, codigo: "PAS-002", nombre: "milhojas", categoria: "Pastelería", precios: { 1: 1.2, 2: 1.1 }, disponible: 0, minimo: 0, activo: true },
      { id: 3, codigo: "BEB-001", nombre: "refresco de botella", categoria: "Bebidas", precios: { 1: 1, 2: 1 }, disponible: 0, minimo: 0, activo: true },
    ],
    clientes: [{ id: 1, nombre: "Ana Ordóñez", telefono: "0414-1234567", cedula: "V-12.345.678", zona: "El Trigal" }],
    pedidos: [] as any[],
    documentos: [] as any[],
    bitacora: [] as any[],
    tasas: { oficial: 807.3862, euro: null, mercado: 944.577068 },
    tasaFecha: null as Date | null,
    euroAMano: false,
    euroCalculado: false,
    seqDoc: 0, seqPedido: 1046, seqProd: 100, seqCliente: 100, seqTipoPrecio: 2,
  }
}

function abrirMostrador(etiqueta: string, D = estadoNuevo()) {
  const almacen = new Map<string, string>()
  const localStorage = {
    getItem: (k: string) => (almacen.has(k) ? almacen.get(k)! : null),
    setItem: (k: string, v: string) => { almacen.set(k, v) },
    removeItem: (k: string) => { almacen.delete(k) },
  }

  /* El fetch no sale a ningún lado: entra derecho a las rutas. */
  const fetchFalso = async (ruta: string, cfg: any) => {
    const url = "http://mostrador" + String(ruta).replace(/^\.\//, "/")
    const pedido = new Request(url, { method: cfg.method, headers: cfg.headers, body: cfg.body })
    return url.indexOf("/api/aparato") >= 0 ? rutaAparato(pedido) : rutaSync(pedido)
  }

  const entorno = {
    D,
    localStorage,
    navigator: { userAgent: "prueba/" + etiqueta, onLine: true },
    window: { crypto: { randomUUID: () => etiqueta + "-" + Math.random().toString(36).slice(2, 12) } },
    crypto: { randomUUID: () => etiqueta + "-" + Math.random().toString(36).slice(2, 12) },
    document: { activeElement: null },
    fetch: fetchFalso,
    /* El temporizador no corre solo: aquí las sincronizaciones se
       piden a mano, para poder mirar entre una y otra. */
    setTimeout: () => 0,
    clearTimeout: () => {},
    render: () => {},
    recalcularComprometido: () => {},
    guardarYa: () => true,
    guardar: () => {},
    hora: (d: Date) => (d ? d.toISOString().slice(11, 16) : ""),
    esc: (t: unknown) => String(t),
    aFecha: (v: unknown) => { if (!v) return null; const d = new Date(v as string); return isNaN(d.getTime()) ? null : d },
    TOPE_BITACORA: 400,
  }

  const fabrica = eval(
    "(function(e){ const {D, localStorage, navigator, window, crypto, document, fetch, setTimeout, clearTimeout," +
    " render, recalcularComprometido, guardarYa, guardar, hora, esc, aFecha, TOPE_BITACORA} = e;\n" +
    bloque +
    "\nreturn { S, sincronizar, delta, aplicar, firma, nuevoId, numeroDoc, idBitacora, asegurarIds," +
    " syncRehacer, syncForzar, textoSync, chipSync, get BASE_ID(){ return BASE_ID } };\n})"
  )
  return Object.assign(fabrica(entorno), { D, etiqueta, almacen })
}

const seccion = (t: string) => console.log("\n" + t)

/* ═══════════════ 1. El servidor contesta ═══════════════ */
seccion("1. El servidor y su esquema")
{
  const r = await rutaSalud()
  const j: any = await r.json()
  vale("/api/salud dice que la base está viva", j.ok === true, JSON.stringify(j))

  const t: any = await pg.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1"
  )
  const tablas = t.rows.map((x: any) => x.table_name)
  igual("se crearon las nueve tablas", tablas, [
    "aparatos", "bitacora", "clientes", "config", "documentos", "pedidos", "productos", "tipos_precio", "usuarios",
  ])

  /* Correr el esquema otra vez no debe romper nada. */
  const r2 = await rutaSalud()
  vale("el esquema se puede volver a crear sin romperse", (await r2.json() as any).ok === true)
}

/* ═══════════════ 2. La puerta ═══════════════ */
seccion("2. La llave")
{
  const sinLlave = new Request("http://x/api/sync", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ aparato: "colado" }),
  })
  const r = await rutaSync(sinLlave)
  vale("sin llave, el servidor no abre", r.status === 401)

  const malaLlave = new Request("http://x/api/sync", {
    method: "POST", headers: { "content-type": "application/json", "x-hayai-token": "otra-cosa-mas" },
    body: JSON.stringify({ aparato: "colado" }),
  })
  vale("con la llave equivocada, tampoco", (await rutaSync(malaLlave)).status === 401)
}

/* ═══════════════ 3. El primer aparato siembra ═══════════════ */
seccion("3. El primer mostrador siembra la base")
const A = abrirMostrador("A")
{
  await A.sincronizar(true)
  vale("el primer contacto no empuja nada", A.S.estado === "aldia", A.S.error)

  const clientes: any = await pg.query("select count(*)::int as n from clientes")
  igual("la base sigue vacía después del primer contacto", clientes.rows[0].n, 0)

  /* La segunda vuelta ya sube lo de aquí, que es la semilla. */
  await A.sincronizar(true)
  const c2: any = await pg.query("select count(*)::int as n from clientes")
  const p2: any = await pg.query("select count(*)::int as n from productos")
  igual("en la segunda vuelta sube el cliente que había", c2.rows[0].n, 1)
  igual("y los tres productos", p2.rows[0].n, 3)

  const col: any = await pg.query("select nombre, telefono, zona from clientes where id = 1")
  igual("los campos de informe se llenaron solos", col.rows[0], {
    nombre: "Ana Ordóñez", telefono: "0414-1234567", zona: "El Trigal",
  })

  await A.sincronizar(true)
  const cuantos: any = await pg.query("select count(*)::int as n from clientes")
  igual("sincronizar de nuevo sin cambios no duplica nada", cuantos.rows[0].n, 1)
}

/* ═══════════════ 4. Cada aparato numera lo suyo ═══════════════ */
seccion("4. Series: dos mostradores no chocan")
const B = abrirMostrador("B")
{
  await B.sincronizar(true)   // primer contacto: se trae lo que hay
  igual("B se trajo el cliente que sembró A", B.D.clientes.length, 1)
  igual("y los productos", B.D.productos.length, 3)

  vale("A y B tienen series distintas", A.S.aparato.serie !== B.S.aparato.serie,
    `A=${A.S.aparato.serie} B=${B.S.aparato.serie}`)

  /* Cada uno crea un cliente, cada uno por su lado, sin verse. */
  const idA = A.nuevoId("seqCliente")
  A.D.clientes.push({ id: idA, nombre: "José Camacho", telefono: "0426-7778899", cedula: "V-9.876.543", zona: "Las Acacias" })
  const idB = B.nuevoId("seqCliente")
  B.D.clientes.push({ id: idB, nombre: "Rosa Medina", telefono: "0424-9988776", cedula: "V-15.220.114", zona: "La Isabelica" })

  vale("los dos ids nuevos son distintos", idA !== idB, `A=${idA} B=${idB}`)
  vale("los dos siguen siendo números", typeof idA === "number" && typeof idB === "number")
  vale("el id lleva la serie por delante", Math.floor(idA / 100000) === A.S.aparato.serie, String(idA))

  await A.sincronizar(true)
  await B.sincronizar(true)
  await A.sincronizar(true)

  const nombresA = A.D.clientes.map((c: any) => c.nombre).sort()
  const nombresB = B.D.clientes.map((c: any) => c.nombre).sort()
  igual("A terminó con los tres clientes", nombresA, ["Ana Ordóñez", "José Camacho", "Rosa Medina"])
  igual("B también", nombresB, ["Ana Ordóñez", "José Camacho", "Rosa Medina"])

  const n: any = await pg.query("select count(*)::int as n from clientes where borrado = false")
  igual("y en la base hay tres, no dos ni cuatro", n.rows[0].n, 3)
}

/* ═══════════════ 5. Una venta viaja entera ═══════════════ */
seccion("5. Una venta hecha en A aparece en B")
{
  const d = {
    id: A.nuevoId("seqDoc"), hora: new Date(), cliente: null, pago: "efectivo_bs",
    lineas: [{ prodId: 1, cant: 2, precio: 1.2 }], total: 1940, tasa: 807.3862,
    cajero: "Ana Delgado", anulado: false,
  }
  A.D.documentos.unshift(d)

  await A.sincronizar(true)
  await B.sincronizar(true)

  igual("B recibió la venta", B.D.documentos.length, 1)
  const dB: any = B.D.documentos[0]
  igual("con su total intacto", dB.total, 1940)
  /* jsonb no conserva el orden de las claves —las normaliza, es lo
     suyo— así que se comparan los valores, no el orden. */
  const ordenado = (o: any) => Object.keys(o).sort().map(k => k + "=" + o[k]).join(",")
  igual("y sus líneas intactas", dB.lineas.map(ordenado), [ordenado({ prodId: 1, cant: 2, precio: 1.2 })])
  vale("la hora volvió a ser una fecha, no un texto", dB.hora instanceof Date,
    typeof dB.hora)
  igual("el número de ticket se lee serie-número",
    A.numeroDoc(d), String(A.S.aparato.serie).padStart(2, "0") + "-00001")

  const fila: any = await pg.query("select total::float as total, cajero, anulado from documentos where id = $1", [d.id])
  igual("y en la base se puede consultar con SQL corriente", fila.rows[0],
    { total: 1940, cajero: "Ana Delgado", anulado: false })
}

/* ═══════════════ 6. Gana el que editó de último ═══════════════ */
seccion("6. Dos tocaron el mismo cliente")
{
  const enA = A.D.clientes.find((c: any) => c.nombre === "Ana Ordóñez")
  enA.telefono = "0414-0000001"
  await A.sincronizar(true)
  await B.sincronizar(true)
  const enB = B.D.clientes.find((c: any) => c.id === enA.id)
  igual("el cambio de A llegó a B", enB.telefono, "0414-0000001")

  /* Ahora B lo cambia y lo manda: es el último que editó. */
  enB.telefono = "0424-9999999"
  await B.sincronizar(true)
  await A.sincronizar(true)
  /* Se busca de nuevo en la lista: aplicar un cambio reemplaza el
     objeto, no lo modifica, y la referencia de antes ya no es la que
     está guardada. */
  const enA2 = A.D.clientes.find((c: any) => c.id === enA.id)
  igual("y el de B, siendo posterior, se impone en A", enA2.telefono, "0424-9999999")

  /* Y una edición vieja que llega tarde no debe pisar la nueva. */
  const antes = new Date(Date.now() - 3600000).toISOString()
  const r = await fetch_prueba({
    aparato: "aparato-rezagado", desde: new Date().toISOString(),
    cambios: { clientes: [{ id: enA.id, datos: { ...enA, telefono: "0000-VIEJO" }, editado: antes }] },
  })
  vale("el servidor acepta la petición del rezagado", (r as any).ok === true)
  const fila: any = await pg.query("select datos->>'telefono' as tel from clientes where id = $1", [enA.id])
  igual("pero no deja que lo viejo pise lo nuevo", fila.rows[0].tel, "0424-9999999")
}

/* ═══════════════ 6b. La ficha de quien está dentro ═══════════════ */
seccion("6b. A quien está dentro se le renueva su ficha")
{
  const yoEnB = B.D.usuarios.find((u: any) => u.id === 1)
  yoEnB.rol = "cajero"
  await B.sincronizar(true)
  await A.sincronizar(true)
  igual("el cambio de rol llegó a A", A.D.usuarios.find((u: any) => u.id === 1).rol, "cajero")
  igual("y la sesión abierta ya no usa la ficha vieja", A.D.usuario.rol, "cajero")

  /* Se deja como estaba, que lo de abajo cuenta con la dueña. */
  yoEnB.rol = "duena"
  await B.sincronizar(true)
  await A.sincronizar(true)
}

/* ═══════════════ 7. Borrar de verdad borra en todos ═══════════════ */
seccion("7. Una baja se propaga")
{
  const cuantosB = B.D.productos.length
  A.D.productos = A.D.productos.filter((p: any) => p.id !== 3)
  await A.sincronizar(true)
  await B.sincronizar(true)
  igual("B se quedó con un producto menos", B.D.productos.length, cuantosB - 1)
  vale("y el que se fue es el correcto", !B.D.productos.some((p: any) => p.id === 3))

  const fila: any = await pg.query("select borrado from productos where id = 3")
  igual("en la base queda la lápida, no un hueco", fila.rows[0].borrado, true)
}

/* ═══════════════ 8. La bitácora solo crece ═══════════════ */
seccion("8. La bitácora")
{
  A.D.bitacora.unshift({ id: A.idBitacora(), hora: new Date(), usuario: "Ana Delgado", texto: "Cerró la caja del día" })
  await A.sincronizar(true)
  const linea: any = await pg.query("select texto, usuario from bitacora order by hora desc limit 1")
  igual("la línea llegó a la base", linea.rows[0], { texto: "Cerró la caja del día", usuario: "Ana Delgado" })

  /* Reescribir una línea de la bitácora no debe cambiar lo que dice. */
  const id = A.D.bitacora[0].id
  await fetch_prueba({
    aparato: "otro", desde: new Date().toISOString(),
    cambios: { bitacora: [{ id, datos: { id, hora: new Date().toISOString(), usuario: "Nadie", texto: "TEXTO CAMBIADO" }, editado: new Date().toISOString() }] },
  })
  const otra: any = await pg.query("select texto from bitacora where id = $1", [id])
  igual("y no se puede reescribir lo que ya quedó anotado", otra.rows[0].texto, "Cerró la caja del día")
}

/* ═══════════════ 9. El freno de mano ═══════════════ */
seccion("9. El freno cuando desaparece casi todo")
{
  /* Un mostrador con bastante gente dentro. */
  const C = abrirMostrador("C")
  for (let i = 0; i < 60; i++) {
    C.D.clientes.push({ id: C.nuevoId("seqCliente"), nombre: "Cliente " + i, telefono: "", cedula: "", zona: "" })
  }
  await C.sincronizar(true)   // primer contacto
  await C.sincronizar(true)   // sube lo suyo
  const enBase: any = await pg.query("select count(*)::int as n from clientes where borrado = false")
  vale("C subió su gente", enBase.rows[0].n > 60, String(enBase.rows[0].n))

  /* Y ahora el accidente: el almacén de ese aparato se vacía. */
  C.D.clientes = []
  C.D.productos = []
  await C.sincronizar(true)

  igual("la sincronización se detiene sola", C.S.estado, "revisar")
  const despues: any = await pg.query("select count(*)::int as n from clientes where borrado = false")
  igual("y no se llevó por delante lo de la base", despues.rows[0].n, enBase.rows[0].n)

  /* La salida buena: traerse lo que hay. */
  await C.syncRehacer()
  vale("«traer lo del servidor» devuelve la sincronización a la normalidad",
    C.S.estado === "aldia", C.S.estado + " " + C.S.error)
  vale("y le devuelve la gente al mostrador", C.D.clientes.length > 60, String(C.D.clientes.length))
}

/* ═══════════════ 10. Empezar de cero no borra el servidor ═══════ */
seccion("10. «Empezar de cero» en un aparato")
{
  const D2 = abrirMostrador("D")
  await D2.sincronizar(true)
  await D2.sincronizar(true)
  const antes: any = await pg.query("select count(*)::int as n from clientes where borrado = false")

  /* Es lo que hace olvidarTodo(): se va el almacén y se va la sombra. */
  D2.almacen.clear()
  D2.S.sombra = {}
  D2.S.aparato.marca = null
  D2.D.clientes = []
  D2.D.productos = []
  D2.D.documentos = []

  await D2.sincronizar(true)
  const despues: any = await pg.query("select count(*)::int as n from clientes where borrado = false")
  igual("la base queda intacta", despues.rows[0].n, antes.rows[0].n)
  vale("y el aparato se trae de vuelta lo que hay", D2.D.clientes.length === antes.rows[0].n,
    `${D2.D.clientes.length} vs ${antes.rows[0].n}`)
}

/* ═══════════════ 11. Los datos del negocio ═══════════════ */
seccion("11. Los datos del negocio y las tasas")
{
  A.D.negocio.nombre = "Panadería HAYAI"
  A.D.tasas.oficial = 900.5
  await A.sincronizar(true)
  await B.sincronizar(true)
  igual("el nombre del negocio llegó a B", B.D.negocio.nombre, "Panadería HAYAI")
  igual("y la tasa también", B.D.tasas.oficial, 900.5)
}

/* ── Un fetch suelto, para hablar con el servidor sin mostrador ── */
async function fetch_prueba(cuerpo: any) {
  const r = await rutaSync(new Request("http://x/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hayai-token": "llave-de-prueba" },
    body: JSON.stringify(cuerpo),
  }))
  return r.json()
}

/* ── El resultado ────────────────────────────────────────────────── */
console.log("\n" + "─".repeat(58))
console.log(`${bien} bien · ${mal} mal`)
if (mal) { console.log("\nLo que falló:"); fallos.forEach(f => console.log("  · " + f)) }
console.log("─".repeat(58))
process.exit(mal ? 1 : 0)
