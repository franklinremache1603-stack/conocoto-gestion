# Actualización de GESTIÓN CONOCOTO a la versión 2

## Cambios con base en el Excel PENDIENTES 25.10.2026

Se analizaron 4.604 registros del Excel entregado. La versión 2 **excluye automáticamente** estas clases antes de la carga: DC01 (3.151), CADE (192), RC01 (26), EMER (21). Quedan **1.214 OT para personal interno** (en ese corte). El ZIP del proyecto NO contiene el Excel ni registros reales.

El filtro se aplica también al resumen, listas, filtros, actividades PM, planificación, históricos en pantalla y exportación. En modo Supabase la función de carga también rechaza estas clases, y la política de lectura de la tabla `orders` las oculta.

Se utiliza exactamente la columna `Desc.Act.PM` para navegar por clase y actividad. `Distrito` y `Calle` permiten agrupación por vías (sin distancias reales). `Pto.tbjo.resp.` y `Status usuario` se muestran **como información del sistema**, separados del responsable y estado de gestión que se ingresan en la aplicación. `Fe.inic.extrema` y `Fe.fin extrema` son **fechas límite del sistema**, no las fechas reales de inicio o fin del tratamiento.

## Cómo actualizar el repositorio que ya publicaste

Repositorio previsto: `CONOCOTO-CONTROL-OT`. No necesitas crear uno nuevo.

**Recomendado: GitHub Desktop**

1. Instala GitHub Desktop en tu computadora, inicia sesión y clona el repositorio actual desde GitHub: **Code → Open with GitHub Desktop**.
2. Descomprime `Conocoto_ACTUALIZACION_v2.zip` en tu PC.
3. Copia su contenido (archivos y carpeta `sql`) **dentro de la carpeta local del repositorio**, reemplazando los archivos de igual nombre.
4. En GitHub Desktop aparecerán los cambios. En **Summary**, escribe `Actualizar control de órdenes a versión 2`, selecciona **Commit to main** y luego **Push origin**.
5. GitHub Pages actualizará el sitio mediante la publicación de la rama `main` ya configurada. Abre el sitio desde el iPad y recarga la página (en Safari, cierra y vuelve a abrir el acceso directo si conserva la versión anterior).

**Muy importante:** el ZIP de actualización NO incluye `config.js`; no debes sobrescribir ese archivo si ya conectaste Supabase. El archivo del Excel NO se publica en GitHub.

## Si usas Supabase para sincronizar iPad y PC

**Antes de publicar el código v2**, entra en Supabase → SQL Editor y ejecuta `sql/03_migracion_v2.sql` una sola vez. Este script agrega columnas y funciones; no borra filas ni historial existente. Si aún no configuraste Supabase y solo usas modo local, este paso no aplica; la información seguirá guardada únicamente en ese navegador y dispositivo.

No cargues datos institucionales a servicios externos sin autorización de la EEQ. El acceso a GitHub Pages es público, por lo que solo debe contener código, no cuentas contrato, direcciones identificables ni órdenes reales.

## Uso diario

1. **Carga de Excel:** importa el archivo diario sin editarlo; la vista previa indicará incluidas/excluidas.
2. **Clases y actividades PM:** abre una clase y luego una `Desc.Act.PM`; selecciona *Ver y gestionar* para abrir las órdenes asociadas.
3. **Órdenes de trabajo:** consulta los datos SAP y actualiza estado interno, responsable, fecha real de inicio, fecha real de fin, fecha planificada y observaciones.
4. **Planificación por calles:** busca distrito o calle; abre las órdenes del grupo o selecciona *Planificar* para asignar responsable y fecha a ese grupo. Esta agrupación es textual, **no una ruta óptima**: confirma los domicilios y la disponibilidad de la cuadrilla en campo.
5. **Exportar:** descarga únicamente las órdenes que se muestran según los filtros de personal interno.

**Validación efectuada:** se comprobó el procesamiento de códigos excluidos, la detección de los encabezados originales, el análisis de fechas Excel y la conservación de estados/responsables/fechas en modo local mediante pruebas de lógica automatizadas. La publicación en tu cuenta GitHub y una instancia Supabase activa todavía deben verificarse en tu entorno.
