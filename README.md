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

## Para entrar

Tres cuentas de prueba, todas con la contraseña `1234`:

| Usuario | Rol |
|---|---|
| `yorbin` | Cajero — vende, monta pedidos y cobra |
| `maria` | Despacho — mueve existencia y entrega |
| `ana` | Dueña — todo, incluidos los permisos |

## Para publicar una versión nueva

Hay que cambiar **dos** números, y tienen que quedar iguales:

- `D.version` en `public/prototipo.html`
- `VERSION` en `public/sw.js`

Con eso, a quien ya la tenga abierta le aparece el aviso de versión nueva y
puede actualizarse cuando termine lo que esté haciendo. Si no se cambian,
nadie se entera de que hay algo nuevo.
