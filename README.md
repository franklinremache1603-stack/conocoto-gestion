# Versión 2 — Agencia Conocoto

**Nota para actualizar un repositorio existente:** lee primero [`ACTUALIZACION_DESDE_GITHUB.md`](ACTUALIZACION_DESDE_GITHUB.md). El ZIP de actualización conserva tu `config.js`. No subas el Excel de pendientes a GitHub.

**Filtro obligatorio de trabajo interno:** DC01, CADE, RC01 y EMER quedan fuera de la importación y de todas las vistas. El archivo del 25/10/2026 contiene 4.604 registros; 3.390 excluidos y 1.214 incluidos. Estas cifras son del corte analizado, no un indicador en vivo.

**Nuevas vistas:** `Clases y actividades PM` (campo `Desc.Act.PM`) y `Planificación por calles` (agrupación textual por `Distrito` y `Calle`, no geográfica). Ahora el formulario de gestión registra fechas reales de inicio/fin, fecha planificada y grupo de recorrido; también se muestran `Status usuario`, `Status sistema`, `Pto.tbjo.resp.`, fechas límite SAP y prioridad de origen.

Si conectas Supabase: ejecuta **`sql/01_esquema_supabase.sql` y luego `sql/03_migracion_v2.sql`** en instalaciones nuevas; en las existentes ejecuta **solo** `sql/03_migracion_v2.sql` antes de actualizar el código. Mantén autorización institucional para el uso de servicios externos.

---

# Agencia Conocoto — Control Operativo de Órdenes

Aplicación web adaptable a **iPad, celular y PC**. Su código se publica con **GitHub Pages** y su información operativa se guarda de forma privada en **Supabase** (base PostgreSQL con autenticación y Row Level Security).

**Estado:** proyecto fuente listo para publicar y configurar. No es una URL activa ni se ha creado un repositorio en tu cuenta. Incluye un **modo local de prueba**, sin sincronización, para revisar la interfaz antes de conectar Supabase.

## Qué hace

- Importa cada día archivos `.xlsx` y `.xls` directamente desde el navegador, incluso desde Archivos en iPad.
- Detecta el encabezado (hasta las primeras 22 filas), la hoja más probable y asigna las columnas conocidas. Permite corregir manualmente las equivalencias antes de cargar.
- Evita duplicados dentro del Excel basándose en el **número de orden** (primera aparición del mismo número).
- Registra fecha de corte, clase OT, fecha de creación, cuenta contrato, sector, dirección, cliente, descripción y estado original (los campos que existan en el Excel).
- Conserva entre cargas el **estado de gestión, responsable, observaciones y fecha compromiso** de cada OT.
- Estados operativos: **Pendiente, En gestión, Atendida, No ejecutada**.
- Muestra KPI de último corte, pendientes, en gestión, atendidas, antigüedad, clases y órdenes por atender.
- Compara los dos últimos archivos: órdenes nuevas y órdenes que **dejaron de aparecer**. **No interpreta automáticamente esas ausencias como atención concluida.**
- Permite búsqueda, filtros, consulta de histórico y exportación del seguimiento filtrado a Excel.
- Conserva registro de cambios en la base de datos (`work_logs`).

> Es una herramienta de gestión **no oficial**, sin integración automática con SAP/EEQ. Las actualizaciones manuales no modifican las órdenes en el sistema comercial. El dato del último Excel es una fotografía de ese momento.

## A. Probarla antes de publicar

1. Abre la carpeta en VS Code o en tu PC.
2. Sirve los archivos con un servidor web local (se recomienda `python -m http.server 8080` desde la carpeta; abre `http://localhost:8080`).
3. Mientras `config.js` tenga sus dos campos vacíos, la app funciona en **modo local**: importa Excel, actualiza órdenes y guarda cambios **solo en ese navegador** (localStorage).
4. **No uses el modo local como sistema operativo definitivo**: borrar el historial del navegador o usar otro dispositivo supone perder visibilidad o sincronización. Para uso real, sigue B–E.

## B. Crear la base privada en Supabase

1. Ingresa en [https://supabase.com/dashboard](https://supabase.com/dashboard) y crea un proyecto autorizado para este tratamiento de datos.
2. En el proyecto, ve a **SQL Editor > New query**. Copia y ejecuta **`sql/01_esquema_supabase.sql`** completo. Crea tablas, políticas RLS, funciones de importación y registro de cambios.
3. En **Authentication > Providers > Email**, desactiva el **registro público (sign ups)**; la creación de cuentas se hará por un administrador. Configura las políticas de contraseñas y MFA según los requisitos institucionales.
4. En **Authentication > Users > Add user**, crea el usuario autorizado y define o confirma su correo.
5. Abre `sql/02_autorizar_usuario.sql`, reemplaza `REEMPLAZAR_CORREO@EJEMPLO.COM` por el correo real y ejecútalo en SQL Editor. Ese es el paso que habilita a la cuenta en la tabla `members`.
6. Para más operadores, crea sus usuarios en Supabase y repite el INSERT cambiando `display_name` y `role` a `operador`. Para suspender acceso, cambia `enabled=false`.
7. En **Project Settings > API Keys** (o en el diálogo **Connect**), copia la **Project URL** y la **publishable key**. **Nunca** uses la secret key ni la service_role key en el navegador o en GitHub.

## C. Conectar la aplicación

Edita `config.js`:

```js
window.CONOCOTO_CONFIG = {
  supabaseUrl: "https://TU-PROYECTO.supabase.co",
  supabasePublishableKey: "sb_publishable_TU_CLAVE_PUBLICABLE"
};
```

La publishable key es adecuada para aplicaciones web **solo porque** este esquema exige autenticación y protege las tablas mediante RLS. Esta clave será visible públicamente en el código servido por GitHub Pages: **no es una contraseña**. No publiques tokens, contraseñas ni la secret/service-role key. Antes de producción, revisa con el área de TI de la EEQ los permisos, retención de datos y disponibilidad del servicio externo.

## D. Crear repositorio GitHub y publicar

1. En GitHub crea un repositorio con nombre sugerido **`conocoto-control-ot`**. En GitHub Free la forma más sencilla de usar Pages con este proyecto es un **repositorio público para el código, sin Excel ni información de clientes**.
2. Sube **el contenido de esta carpeta**, incluyendo `index.html`, `style.css`, `app.js`, `config.js`, `favicon.svg`, `sql/`, `.nojekyll` y `.github/workflows/pages.yml`. No subas la carpeta ZIP como único archivo; debe estar el código descomprimido.
3. Verifica que la rama principal se llame `main` (el workflow usa `main`).
4. Abre **Settings > Pages > Build and deployment > Source**, selecciona **GitHub Actions**.
5. Abre **Actions** y verifica el flujo `Publicar Conocoto en GitHub Pages` (también puedes dispararlo manualmente).
6. Cuando termine, Pages mostrará la URL. En repositorios de proyecto suele tener esta forma: `https://TU_USUARIO.github.io/conocoto-control-ot/` (ejemplo de formato, no una URL creada).
7. Abre esa dirección desde Safari en iPad. Inicia sesión con el usuario autorizado en Supabase; opcionalmente elige **Compartir > Añadir a pantalla de inicio**.

La publicación utiliza solo archivos HTML, CSS y JavaScript; **no requiere npm ni compilar**. El sitio público no contiene órdenes operativas. Las órdenes se consultan en Supabase tras autenticar al usuario y pasar las políticas RLS.

## E. Flujo diario

1. Exporta desde el sistema comercial el Excel de **órdenes pendientes de Conocoto**.
2. Abre la aplicación desde el iPad o PC e inicia sesión.
3. Pulsa **Carga de Excel > Seleccionar archivo** y define la **fecha de corte**.
4. Confirma que el campo **Número de orden** coincida con su columna real. Revisa la vista previa y pulsa **Confirmar importación**.
5. Abre **Órdenes de trabajo** y entra a **Gestionar** para asignar responsable, cambiar estado, anotar resultados y fechas compromiso.
6. Al siguiente día, importa otro Excel. La herramienta retiene las gestiones de las órdenes existentes. Consulta en **Historial** los cortes pasados.
7. Descarga un Excel de seguimiento desde **Órdenes de trabajo > Exportar vista Excel** cuando necesites remitir un reporte.

## Formato de Excel

Una fila por orden. El número de orden es **obligatorio**. Si el Excel tiene un título antes del encabezado, el sistema busca la fila de encabezados. Acepta nombres típicos como:

| Dato | Encabezados reconocidos (ejemplos) |
|---|---|
| Orden | `Orden`, `Número de orden`, `Nº orden`, `Orden de trabajo`, `OT` |
| Clase | `Clase de orden`, `Tipo de orden`, `Clase OT` |
| Fecha de origen | `Fecha de creación`, `Fecha orden`, `Fecha solicitud` |
| Cuenta | `Cuenta contrato`, `Cuenta` |
| Sector | `Sector`, `Parroquia`, `Barrio` |
| Dirección | `Dirección`, `Calle` |
| Descripción | `Texto breve`, `Descripción`, `Detalle` |
| Estado de origen | `Estado`, `Estatus` |

**Atención:** las fechas numéricas con barras se interpretan en formato ecuatoriano `dd/mm/aaaa`. Valida los encabezados en la vista previa. Si tu exportación tiene nombres particulares, en la pantalla de carga puedes elegir la columna manualmente. Órdenes duplicadas en el archivo se cuentan una sola vez.

## Semántica y seguridad

- `ATENDIDA` es una **marca manual interna**. Si una orden sigue saliendo en el siguiente Excel de pendientes, conviene comprobar su cierre en el sistema institucional.
- `No aparece en el último corte` significa solamente **ausencia en el archivo**; puede responder a filtros del reporte, traslados u otras causas, **no** demuestra que se haya atendido.
- El identificador de la orden es una clave única. Si el sistema utiliza el mismo número de OT en varios ámbitos, se necesita adaptar la clave al origen antes de operar.
- El histórico de importaciones conserva las órdenes incluidas en cada corte (`import_lines`) y existe un registro de cambios (`work_logs`) en Supabase.
- No se suben los Excel originales a GitHub ni a Supabase Storage. Se leen en el navegador y solo se envían los campos normalizados a la base privada.
- La base de datos utiliza RLS y funciones autorizadas, y el registro público de usuarios debe permanecer desactivado. **Todos los miembros habilitados tienen acceso a todas las OT del proyecto**; si se necesitan permisos por zona o cargo, debe ampliarse el modelo de seguridad.
- Revisa con TI si la información de clientes/órdenes de la EEQ está autorizada para alojarse en servicios externos y determina la región de datos permitida. En caso contrario, usa infraestructura aprobada por la institución.
- Para restauración y continuidad operacional, configura copias de seguridad en Supabase según tu plan y política de retención. El modo local no constituye una copia centralizada.
- Las bibliotecas del lector Excel y Supabase se cargan desde sus CDNs oficiales; se necesita Internet para cargarlas. `SheetJS` usa la versión 0.20.3. En una versión institucional conviene alojar dependencias revisadas localmente y añadir CSP.

## Estructura

```
conocoto-control-ot/
├── .github/workflows/pages.yml   # Publicación GitHub Pages
├── .gitignore                     # No versionar Excel ni archivos sensibles
├── .nojekyll
├── index.html                     # Pantallas iPad / escritorio
├── style.css                      # Tema visual adaptable
├── app.js                         # Lectura Excel, filtros, gestión, sincronización
├── config.js                      # URL + publishable key (NO claves secretas)
├── favicon.svg
└── sql/
    ├── 01_esquema_supabase.sql
    └── 02_autorizar_usuario.sql
```

## Problemas comunes

- **Solo veo modo local:** `config.js` está vacío o la URL/key no están definidas.
- **No puedo iniciar sesión:** usuario no creado en Authentication, contraseña incorrecta, falta el alta en `members` o la cuenta está deshabilitada.
- **No aparecen órdenes:** verifica los mapeos de columnas, que se completó el corte, y la RLS del proyecto.
- **Error al importar lote:** revisa que hayas ejecutado íntegramente el SQL, que los permisos de RPC estén activos y que el importador detectó fechas válidas.
- **La página da 404:** revisa Settings > Pages y que el workflow haya terminado correctamente.
- **El iPad no refleja lo de la PC:** los dos dispositivos deben abrir la misma URL publicada y usar cuentas autorizadas del **mismo** proyecto de Supabase.
- **No se carga el Excel:** Internet debe permitir descargar `xlsx.full.min.js` desde `cdn.sheetjs.com`.

## Próxima adaptación recomendada

Probar con un **Excel real exportado de Conocoto** para ajustar nombres de columnas, formatos de fecha, códigos de estado y determinar si existen varias órdenes con el mismo ID. No se incluyen datos ficticios como si fueran operaciones reales.
