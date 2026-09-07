# hayai-sistema-de-pedidos

**HAYAI Mostrador** — punto de venta y encargos para panadería.

Venta de mostrador, pedidos por encargo, inventario, clientes, facturación
y cierre de caja, con la tasa del BCV al día. Se instala como aplicación,
sigue tomando pedidos cuando se cae el internet, y varios aparatos ven lo
mismo porque se ponen de acuerdo solos en cuanto vuelve la red.

## Dónde está el sistema

El mostrador vive en **`public/prototipo.html`**: un solo archivo con su
HTML, su CSS y su JavaScript escritos a mano, sin dependencias ni
compilación. Ahí está todo lo que se ve y todo lo que se toca.

Al lado van los tres archivos que lo convierten en aplicación instalable, y
los cuatro tienen que quedar juntos:

| Archivo | Para qué |
|---|---|
| `public/prototipo.html` | El sistema entero |
| `public/sw.js` | Que abra sin internet y avise de versiones nuevas |
| `public/manifest.webmanifest` | Que se pueda instalar |
| `public/icono.png` | Su icono |

Y del otro lado, la parte que hace que lo del mostrador no viva en un
solo aparato:

| Archivo | Para qué |
|---|---|
| `lib/db.ts` | Las tablas y cómo se guarda cada registro |
| `lib/puerta.ts` | La llave que hay que traer para entrar a `/api` |
| `app/api/sync/` | Mandar lo de aquí y traerse lo de los demás |
| `app/api/aparato/` | Darle su número de serie a cada mostrador |
| `app/api/salud/` | Decir si la base contesta, para probar el despliegue |

`design-system.html` es el sistema de diseño —los colores, la letra y los
componentes— y no hace falta para que el mostrador funcione.

## Para verlo

Cualquier servidor estático sirve. Con Python:

```bash
cd public
python -m http.server 8080
```

y abrir <http://127.0.0.1:8080/prototipo.html>.

Con `file://` la interfaz se ve igual, pero no hay instalación ni modo sin
internet: el navegador exige un sitio servido (`localhost` cuenta) para
registrar el trabajador de servicio.

### Con Next.js

El proyecto trae un cascarón mínimo de Next que solo sirve el archivo: la
raíz `/` redirige a `/prototipo.html`. No hace falta para nada más.

```bash
pnpm install
pnpm dev
```

## Dónde se guardan los datos

En dos sitios, y ese es el asunto entero.

**En el aparato.** Todo —ventas, pedidos, inventario, clientes,
usuarios y ajustes— se guarda primero en el propio aparato, en el
almacén del navegador (`localStorage`, bajo la llave `hayai-mostrador`).
Esto no es un apaño: es lo que hace que se pueda cobrar con el internet
caído. El mostrador nunca espera al servidor para dar una venta por
buena.

**En la base de datos.** Cada medio minuto, si hay red, el aparato
manda lo que cambió y se trae lo que cambiaron los demás. También en
cuanto algo cambia, sin esperar el turno, y al volver a la pantalla, y
en cuanto vuelve el internet. Sin red no pasa nada: se sigue
trabajando y lo pendiente sale solo cuando la red vuelve.

En Ajustes → *Sincronización* se ve el estado, cuántos cambios hay
esperando y el botón para forzarla.

### Cómo se ponen de acuerdo dos aparatos

Cada aparato tiene una **serie**, un número de dos cifras que le da el
servidor la primera vez que hablan. Con ella numera todo lo que crea,
así que el cliente 101 del mostrador y el 101 del teléfono nunca son el
mismo. Por eso el número de ticket ahora se lee `47-00042`: la serie y
el correlativo, como un talonario.

Cuando dos tocaron lo mismo, **gana el que editó de último**. Lo decide
el servidor comparando la hora de edición, no la de llegada: un aparato
que estuvo tres horas sin internet no pisa con lo suyo lo que se
escribió después.

La bitácora es la excepción: sólo crece. En el aparato se poda a las
400 líneas más recientes para no llenar el almacén, pero en la base se
conservan todas y no se pueden reescribir.

### El freno de mano

Si de golpe a un aparato le faltara casi todo lo que tenía —alguien le
dio a *Empezar de cero*, o el navegador vació su almacén— eso no es que
hayan borrado ochenta clientes uno por uno: es un accidente. Antes que
replicarlo al resto, la sincronización **se detiene sola** y lo dice.
Desde Ajustes se elige qué pasó: traerse lo del servidor (lo normal) o
mandar las bajas de verdad.

### Lo que no viaja

De propósito: la venta a medio cobrar, el pedido a medio montar, quién
está adentro, el tema, el color y el tamaño de la letra. Eso es de cada
aparato. Mandarlo sería moverle la pantalla a otro mientras trabaja.

La sesión abierta se recupera al recargar, pero **caduca a las 12
horas**: un mostrador es compartido y no debe quedar abierto de un día
para otro.

## Montar el servidor

Sin esto el mostrador funciona igual que siempre, sólo que cada aparato
con lo suyo. Son tres pasos y se hacen una vez.

**1. La base.** En Vercel, *Storage → Create Database → Neon*. Al
crearla, Vercel deja sola la variable `DATABASE_URL` en el proyecto. Las
tablas no hay que crearlas a mano: se crean solas la primera vez que
alguien llama a `/api`.

**2. La llave.** Se inventa una cadena larga:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

y se pone en **dos** sitios, exactamente igual en los dos:

- la variable `HAYAI_TOKEN` en Vercel;
- la constante `LLAVE_API`, arriba del todo del bloque `SINCRONIZAR`
  en `public/prototipo.html`.

Si no coinciden, el servidor no abre y el mostrador lo dice en Ajustes.
Mientras `LLAVE_API` esté vacía, el mostrador ni lo intenta.

**3. Comprobarlo.** Abrir `/api/salud`. Tiene que contestar
`{"ok":true,"base":true,"llave":true}`. Si dice `"llave":false` falta
`HAYAI_TOKEN`; si falla la base, falta o está mal `DATABASE_URL`.

Lo que conviene saber: esa llave viaja dentro del propio mostrador, o
sea que quien pueda abrir la aplicación puede leerla. Es el cerrojo de
la puerta —para que la dirección, si se comparte, no sea también
permiso de escribir en la base— no la identidad de cada quien: eso lo
siguen llevando los usuarios de aquí dentro. Si se filtra, se cambia en
los dos sitios y se publica.

## Las pruebas

```bash
pnpm test
```

Son dos, y ninguna simula la parte que importa:

- **Arranque** — carga `prototipo.html` entero en un navegador de
  mentira, lo deja correr, entra con una cuenta y comprueba que pinta.
  Es la que atrapa lo tonto que la sintaxis no ve.
- **Sincronización** — levanta un Postgres de verdad dentro del propio
  proceso, llama a las rutas que se despliegan y recorta el motor de
  sincronización del propio `prototipo.html` para ejecutarlo tal cual.
  Comprueba la siembra, las series, los conflictos, las bajas, el freno
  de mano y que *Empezar de cero* no se lleve por delante la base.

## Quién ve qué

Cada rol entra solo a sus pantallas. La pantalla de entrada no da pistas de
cuentas: quien entra ya sabe la suya.

| Pantalla | Cajero | Despacho | Contador | Dueña |
|---|:--:|:--:|:--:|:--:|
| Venta | entra | entra | — | entra |
| Pedidos | entra | entra | mira | entra |
| Inventario | — | entra | mira | entra |
| Clientes | entra | entra | mira | entra |
| Facturación | — | — | mira | entra |
| Ventas y cierre | — | — | mira | entra |
| Usuarios | — | — | — | entra |
| Ajustes | — | — | mira | entra |

La **dueña** es la única que agrega usuarios, y desde Usuarios → *Permisos*
puede abrirle o cerrarle pantallas a cualquiera, una por una, sin cambiarle
el rol. Nadie puede tocar sus propios permisos: si no, alguien se deja
afuera solo y no hay quien lo reponga.

Las cuentas de prueba (`yorbin` cajero, `maria` despacho, `ana` dueña) están
en `D.usuarios`, dentro de `public/prototipo.html`.

## Para publicar una versión nueva

Hay que cambiar **dos** números, y tienen que quedar iguales:

- `D.version` en `public/prototipo.html`
- `VERSION` en `public/sw.js`

Con eso, a quien ya la tenga abierta le aparece el aviso de versión nueva y
puede actualizarse cuando termine lo que esté haciendo. Si no se cambian,
nadie se entera de que hay algo nuevo.
