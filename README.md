# Calculadora comercial Monttelier

Herramienta interna de Monttelier Arquitectura para calcular el precio de venta de pérgolas palilleras y generar la cotización de una página, lista para imprimir o guardar en PDF. Funciona en el celular, se puede instalar como aplicación (PWA) y no necesita inicio de sesión ni base de datos.

## 1. Abrirla

- **Desde la carpeta:** doble clic en `index.html`. Todo funciona (calcular, cotizar, administrar), pero así no se puede instalar como aplicación ni usar sin conexión. Probada en Google Chrome.
- **Publicada en internet (recomendado):** ver la sección 5. Con una dirección `https` se puede instalar en el celular y funciona sin conexión después de abrirla una vez.
- **Servidor local (opcional, para pruebas):** en la carpeta del proyecto ejecutar `python3 -m http.server 8080` y abrir `http://localhost:8080`.

## 2. Usarla

1. **Dimensiones:** ancho y proyección en metros. Los botones − y + saltan a la medida anterior o siguiente de la lista de precios.
2. **Configuración:** entre paredes, pared portería o doble portería.
3. **Accionamiento:** sistema manual o motorizado.
4. **Lona:** acrílica europea, PVC o Soltis.
5. **Cantidad:** todas las unidades tienen la misma configuración y dimensiones.
6. **Transporte e instalación:** elegir el departamento. «Otro» pide el nombre y el valor del transporte. La instalación se calcula sola y se puede ajustar con «Ajustar valor manualmente».
7. **Datos del cliente (opcional).**

El resumen muestra cada valor del cálculo. Cuando no falta nada, se activa **GENERAR COTIZACIÓN / IMPRIMIR PDF**, que abre la vista previa. Ahí, **IMPRIMIR / GUARDAR PDF** abre la ventana de impresión: elegir «Guardar como PDF» como impresora. En el celular, usar la opción Imprimir o Compartir del navegador.

- **Corregir datos** vuelve a la calculadora y conserva el número de la cotización.
- **Nueva cotización** limpia el formulario; la siguiente cotización que se genere toma el número siguiente.
- El formulario queda guardado en el navegador, así que no se pierde si se cierra la página.

## 3. Reglas de cálculo

| Concepto | Regla |
|---|---|
| Precio base | Solo medidas exactas de la lista (pasos de 0,25 m). Otra medida muestra «Requiere cotización especial»; nunca se aproxima un precio. |
| Lona | Acrílica europea: precio base. PVC: +25%. Soltis: +50%. El porcentaje se aplica solo al precio base de la matriz, por unidad, redondeado a pesos. |
| Motor | Se suma por unidad al precio manual: categoría 1 $3.305.784, categoría 2 $3.400.000. Categoría 2 = celdas dentro del recuadro negro (ancho y proyección desde 3,25 m). La lona no se aplica al motor. |
| Instalación | Una vez por cotización, según el área total (ancho × proyección × cantidad): menos de 16 m² $300.000; más de 25 m² $450.000; de 16 a 25 m² (incluidos) el valor está **pendiente**: la calculadora lo pide manualmente hasta que se defina en Administración. |
| Transporte | Una vez por cotización, según el departamento. |
| IVA | 19% sobre pérgolas + instalación + transporte. En Administración se cambia la tasa y qué conceptos pagan IVA. |
| Redondeo | Todos los valores en pesos enteros. |
| Cotización | Muestra las dos alternativas (manual y motorizada) con las mismas medidas, lona, instalación y transporte, antes y después de IVA. «VALOR TOTAL DE LA COTIZACIÓN» es la alternativa seleccionada en la calculadora. |

Ejemplo: pared portería 5,00 × 3,00 m, lona acrílica, 1 unidad, Cundinamarca: sistema manual $9.105.172 y sistema motorizado $13.039.055, con IVA.

## 4. Administración (cambiar precios sin tocar código)

Menú **Administración**. Los cambios se aplican al presionar **Guardar cambios**; **Descartar** los deshace. Si hay un dato inválido, se marca en rojo y no se guarda.

- **Matrices de precios:** tabla tipo Excel por configuración (filas: proyección, columnas: ancho). En computador se navega con las flechas y Enter, y se pueden pegar bloques copiados desde Excel en cualquier celda. Una celda vacía significa que esa medida requiere cotización especial. La zona de categoría 2 del motor se ve resaltada y su límite se puede cambiar.
- **Motorización, tipos de lona, accionamiento:** valores, porcentajes y textos que aparecen en la cotización.
- **Instalación:** límites de área y valores. Dejar vacío el valor intermedio mientras esté pendiente.
- **Transporte por departamento:** editar, agregar o quitar departamentos. «Otro» siempre está disponible en la calculadora.
- **IVA:** tasa y base gravable.
- **Empresa y numeración:** datos de la empresa (los vacíos no se muestran), título, prefijo y siguiente número de cotización.
- **Características, condiciones y garantía:** textos fijos de la cotización. Validez, forma de pago y tiempo de entrega solo aparecen si tienen texto.
- **Respaldo:** exportar la configuración a un archivo JSON, importarla (se valida antes de reemplazar nada) o restaurar los valores originales. Importar y restaurar nunca hacen retroceder la numeración.

## 5. Publicarla

El sitio publicado queda accesible para cualquier persona que tenga la dirección (incluye los precios). La página pide a los buscadores no indexarla, pero no tiene contraseña: compartan la dirección solo con el equipo.

**Opción A: Netlify (la más simple)**

1. Entrar a <https://app.netlify.com/drop> (requiere una cuenta gratuita).
2. Arrastrar la carpeta del proyecto.
3. Netlify entrega una dirección `https://…netlify.app`.

**Opción B: GitHub Pages**

1. Crear un repositorio y subir todos los archivos de esta carpeta (con `index.html` en la raíz).
2. En el repositorio: Settings → Pages → «Deploy from a branch» → rama `main`, carpeta `/ (root)`.
3. Abrir `https://<usuario>.github.io/<repositorio>/`.

En la cuenta gratuita de GitHub, Pages exige que el repositorio sea público.

**Instalar en el celular** (con la dirección `https` abierta):

- Android (Chrome): menú ⋮ → «Instalar aplicación» o «Agregar a la pantalla principal».
- iPhone (Safari): botón Compartir → «Agregar a inicio».

**Publicar una actualización del código:** subir los archivos modificados. La app instalada muestra la versión nueva en la siguiente apertura. Si se agregan o eliminan archivos, actualizar la lista `APP_FILES` y cambiar `CACHE_VERSION` en `sw.js`.

## 6. Datos guardados y respaldos

- La configuración (precios, textos, numeración) y el formulario en curso se guardan en el navegador de cada dispositivo (`localStorage`, claves `monttelier.cotizador.config.v1` y `monttelier.cotizador.draft.v1`).
- Si se borran los datos del navegador, se pierden los cambios: **exportar un respaldo después de cambiar precios.**
- Cada dispositivo tiene su propia configuración y numeración. Para llevar los precios a otro celular: exportar en uno e importar en el otro. Si varios dispositivos cotizan, usar un prefijo distinto en cada uno (por ejemplo `COT-A-` y `COT-B-`) para no repetir números.
- Los valores por defecto del código solo se usan en un navegador que nunca guardó cambios. Para volver a ellos: Administración → Respaldo → «Restaurar valores por defecto».

## 7. Estructura del código

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de las tres vistas: calculadora, cotización y administración |
| `css/app.css` | Estilos de pantalla (mobile first) y de la hoja de cotización |
| `css/print.css` | Impresión: solo la cotización, en una página carta o A4 |
| `js/default-config.js` | Configuración por defecto: matrices, motor, lonas, instalación, transporte, IVA y textos |
| `js/format.js` | Formato y lectura de pesos, medidas y fechas |
| `js/pricing.js` | Motor de cálculo (sin pantalla): todas las reglas de la sección 3 |
| `js/storage.js` | Guardado local, validación de la configuración y respaldo JSON |
| `js/dom.js` | Utilidades de pantalla compartidas |
| `js/calculator.js` | Vista de la calculadora y resumen |
| `js/quote.js` | Cotización imprimible |
| `js/admin.js` | Panel de administración |
| `js/app.js` | Arranque, navegación y registro del service worker |
| `sw.js`, `manifest.webmanifest` | Instalación como app y uso sin conexión |
| `assets/` | Logo e íconos de la aplicación |
| `docs/verified-prices.json` | Las 1.449 celdas verificadas de las tres matrices, con la regla de categorías |
| `docs/price-lists/` | Imágenes originales de las listas de precios |

El código es HTML, CSS y JavaScript sin dependencias ni compilación. Los scripts comparten el objeto global `window.Cotizador`.

## 8. Origen de los precios

Las tres matrices se transcribieron de las imágenes de `docs/price-lists/` y se verificaron celda por celda (`docs/verified-prices.json`). Monttelier confirmó 13 celdas contra el Excel el 6 de noviembre de 2026. La celda de pared portería 3,75 × 4,25 m ($7.789.091) no sigue el patrón de su fila, pero se dejó tal como la confirmó Monttelier.

## 9. Pendientes del negocio

- Definir el valor de instalación para áreas de 16 a 25 m² (Administración → Instalación).
- Escribir validez de la oferta, forma de pago y tiempo de entrega, y completar los datos de la empresa (Administración).
- Los textos de lona PVC y Soltis son neutros («Lona PVC.», «Lona Soltis.»): completarlos con las características reales.
