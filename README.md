# hayai-sistema-de-pedidos

**HAYAI Mostrador** — punto de venta y encargos para panadería.

Venta de mostrador, pedidos por encargo, inventario, clientes, facturación
y cierre de caja, con la tasa del BCV al día. Se instala como aplicación y
sigue tomando pedidos cuando se cae el internet.

## Dónde está el sistema

Todo vive en **`public/prototipo.html`**: un solo archivo con su HTML, su CSS
y su JavaScript escritos a mano, sin dependencias ni compilación. Se abre
sirviéndolo con cualquier servidor.

Al lado van los tres archivos que lo convierten en aplicación instalable, y
los cuatro tienen que quedar juntos:

| Archivo | Para qué |
|---|---|
| `public/prototipo.html` | El sistema entero |
| `public/sw.js` | Que abra sin internet y avise de versiones nuevas |
| `public/manifest.webmanifest` | Que se pueda instalar |
| `public/icono.png` | Su icono |

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

Todo —ventas, pedidos, inventario, clientes, usuarios y ajustes— se guarda
en el propio aparato, en el almacén del navegador (`localStorage`, bajo la
llave `hayai-mostrador`). No hace falta servidor ni internet: se cierra el
navegador, se vuelve a abrir y está donde quedó.

Lo que **no** se guarda es lo de la pantalla: en qué vista estabas, qué
ventana tenías abierta, qué habías escrito en un buscador. Eso se arma solo
al abrir.

Consecuencias que conviene tener claras:

- Cada aparato tiene sus propios datos. **No se sincronizan entre sí.**
- Borrar los datos del navegador se los lleva. Lo mismo una ventana privada.
- La sesión abierta se recupera al recargar, pero **caduca a las 12 horas**:
  un mostrador es compartido y no debe quedar abierto de un día para otro.
- La bitácora se poda a las 400 líneas más recientes para no llenar el
  almacén. Un día de trabajo ocupa unos 40 KB de los ~5 MB disponibles.

En Ajustes → *Dónde se guarda* se ve cuándo fue el último guardado y está
el botón **Empezar de cero**, que borra todo y devuelve los datos de ejemplo.

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
