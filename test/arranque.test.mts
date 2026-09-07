/* ═══════════════════════════════════════════════════════════════
   Prueba de arranque

   Que el mostrador abra. Se carga prototipo.html entero en un
   navegador de mentira, se le deja correr su JavaScript y se mira que
   pinte la pantalla de entrada sin haber roto nada por el camino.

   Es la prueba que atrapa lo tonto: una función que se llama antes de
   existir, un nombre mal escrito, algo que se quedó a medias. Nada de
   eso lo ve el comprobador de sintaxis.

   Correr con:  npx tsx test/arranque.test.mts
   ═══════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs"
import { JSDOM, VirtualConsole } from "jsdom"

let bien = 0, mal = 0
const fallos: string[] = []
function vale(que: string, cond: boolean, detalle = "") {
  if (cond) { bien++; console.log("  ok   " + que) }
  else { mal++; fallos.push(que + (detalle ? " — " + detalle : "")); console.log("  MAL  " + que + (detalle ? " — " + detalle : "")) }
}

const html = readFileSync("public/prototipo.html", "utf8")

/* ── El viewport: sin esto no hay responsive que valga ──────────── */
console.log("\n1. La cabecera del documento")
{
  const m = html.match(/<meta\s+name="viewport"[^>]*>/i)
  vale("la etiqueta viewport está puesta", !!m, "no aparece en el archivo")
  const c = m ? (m[0].match(/content="([^"]*)"/) || [])[1] || "" : ""
  vale("dice width=device-width", c.indexOf("width=device-width") >= 0, c)
  vale("dice initial-scale=1", c.indexOf("initial-scale=1") >= 0, c)
  vale("y viewport-fit=cover, que es lo que activa el safe-area del CSS",
    c.indexOf("viewport-fit=cover") >= 0, c)
  vale("no bloquea el zoom del usuario",
    c.indexOf("user-scalable=no") < 0 && c.indexOf("maximum-scale") < 0, c)
}

/* ── Que arranque ───────────────────────────────────────────────── */
console.log("\n2. El mostrador abre")
const gritos: string[] = []
const consolaVirtual = new VirtualConsole()
consolaVirtual.on("jsdomError", (e: any) => gritos.push(String(e?.message || e)))
consolaVirtual.on("error", (...a: unknown[]) => gritos.push(a.map(String).join(" ")))

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost:8080/prototipo.html",
  virtualConsole: consolaVirtual,
})
const w = dom.window as any
/* Ojo: en un script clásico, lo declarado con const/let no cuelga de
   window —sólo var y las funciones—. Para mirar D, S o LLAVE_API hay
   que preguntárselo a la propia página. */
const mirar = (expr: string) => w.eval(expr)

/* Se le da un respiro a los temporizadores del arranque. */
await new Promise(r => setTimeout(r, 400))

vale("el JavaScript corrió entero sin reventar", gritos.length === 0, gritos.slice(0, 3).join(" | "))
vale("hay un nodo #app pintado", !!w.document.querySelector("#app"))

const texto = (w.document.body.textContent || "").replace(/\s+/g, " ")
vale("se ve la pantalla de entrada", /Entrar|Usuario|Clave/i.test(texto), texto.slice(0, 120))

/* ── Las piezas nuevas están donde deben ────────────────────────── */
console.log("\n3. Las piezas de la sincronización")
{
  vale("el motor de sincronización se cargó", typeof w.sincronizar === "function")
  vale("el aparato ya tiene identidad", !!mirar("S.aparato && S.aparato.uuid"), mirar("JSON.stringify(S.aparato)"))
  const serie = mirar("S.aparato.serie")
  vale("y una serie de dos dígitos", serie >= 10 && serie <= 99, String(serie))
  vale("la serie quedó guardada en el almacén del aparato",
    !!w.localStorage.getItem("hayai-aparato"))

  /* Sin llave, el mostrador no debe intentar hablar con nadie. */
  vale("sin llave configurada, la sincronización se queda quieta",
    mirar("LLAVE_API") === "", JSON.stringify(mirar("LLAVE_API")))
  vale("y lo dice con todas sus letras", w.textoSync() === "Solo en este aparato", w.textoSync())
  vale("sin llave no pinta el chip de la banda", w.chipSync() === "", w.chipSync())
}

/* ── Numeración y datos ─────────────────────────────────────────── */
console.log("\n4. Numeración")
{
  const serie = mirar("S.aparato.serie")
  const base = serie * 100000
  const id = w.nuevoId("seqCliente")
  vale("un id nuevo lleva la serie por delante", Math.floor(id / 100000) === serie, String(id))
  vale("y sigue siendo un número, que la interfaz lo lee con Number()", typeof id === "number")
  vale("el id supera la base del aparato", id > base, `${id} vs ${base}`)

  vale("un documento viejo se sigue leyendo como antes", w.numeroDoc({ id: 42 }) === "00042", w.numeroDoc({ id: 42 }))
  vale("y uno nuevo, como serie-número",
    w.numeroDoc({ id: base + 7 }) === String(serie).padStart(2, "0") + "-00007",
    w.numeroDoc({ id: base + 7 }))

  vale("la bitácora arranca con ids", mirar("D.bitacora.every(b => !!b.id)"), "alguna línea sin id")
}

/* ── Que se pueda entrar y navegar ──────────────────────────────── */
console.log("\n5. Se entra y se ve el mostrador")
{
  const u = w.document.querySelector("#usuario") as any
  const c = w.document.querySelector("#clave") as any
  vale("la pantalla de entrada tiene sus dos campos", !!u && !!c)
  if (u && c) {
    u.value = "ana"; c.value = "1234"
    const boton = Array.from(w.document.querySelectorAll("[data-a]"))
      .find((b: any) => (b.dataset.a || "").toLowerCase().indexOf("entrar") >= 0) as any
    if (boton) boton.click()
    await new Promise(r => setTimeout(r, 200))
    vale("se entró", !!mirar("D.usuario"), "sigue sin sesión")
    const t2 = (w.document.body.textContent || "").replace(/\s+/g, " ")
    vale("y el menú está pintado", /Venta|Pedidos|Clientes/i.test(t2), t2.slice(0, 140))
    vale("sin haber roto nada al pintar", gritos.length === 0, gritos.slice(0, 3).join(" | "))

    /* El renglón nuevo de Ajustes tiene que armarse sin caerse. */
    mirar('D.pantalla = "ajustes"; D.ajusteAbierto = "sync"; render()')
    const t3 = (w.document.body.textContent || "").replace(/\s+/g, " ")
    vale("Ajustes muestra el renglón de Sincronización", /Sincronizaci/i.test(t3))
    vale("y explica que no hay servidor puesto", /LLAVE_API/.test(t3), t3.slice(0, 200))
    vale("pintar Ajustes tampoco rompió nada", gritos.length === 0, gritos.slice(0, 3).join(" | "))
  }
}

console.log("\n" + "─".repeat(58))
console.log(`${bien} bien · ${mal} mal`)
if (mal) { console.log("\nLo que falló:"); fallos.forEach(f => console.log("  · " + f)) }
console.log("─".repeat(58))
dom.window.close()
process.exit(mal ? 1 : 0)
