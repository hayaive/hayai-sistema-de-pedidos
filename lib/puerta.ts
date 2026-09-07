/* ═══════════════════════════════════════════════════════════════
   La puerta

   Todo lo que entra por /api trae una llave compartida (HAYAI_TOKEN).
   Sin ella no se abre. Sirve para que la dirección de la aplicación,
   si se la pasan a alguien o aparece en un buscador, no sea también
   permiso de escribir en la base del negocio.

   Hasta dónde alcanza, dicho claro: la llave viaja dentro del propio
   mostrador, así que quien pueda abrir la aplicación puede leerla. No
   es identidad de persona —eso lo sigue llevando el mostrador con sus
   usuarios— sino el cerrojo de la puerta. Si se filtra, se cambia la
   variable en Vercel y se vuelve a desplegar: todos los aparatos la
   recogen con la siguiente versión.
   ═══════════════════════════════════════════════════════════════ */

export function pasa(req: Request) {
  const esperada = process.env.HAYAI_TOKEN || ""
  /* Sin llave configurada no se abre nada. Es a propósito: una base
     sin cerrojo por descuido es peor que una que no responde. */
  if (!esperada) return false
  const trae = req.headers.get("x-hayai-token") || ""
  if (trae.length !== esperada.length) return false
  /* Comparar sin delatar en cuánto se parecen. */
  let dif = 0
  for (let i = 0; i < esperada.length; i++) dif |= trae.charCodeAt(i) ^ esperada.charCodeAt(i)
  return dif === 0
}

export function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  })
}

export function noPasa() {
  return json({ ok: false, error: "Sin permiso" }, 401)
}
