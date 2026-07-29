# HANDOFF — Reingeniería Módulo Financiero (CFDI 4.0 sin pérdida)

> Sesión 1–2: 2026-06-30. Sesión 3: 2026-06-30 → 2026-07-02 (estados de cuenta, conciliación
> manual, rama PDF, dashboard CxC, fix de deadlock de auth). **Sesión 4: 2026-07-02 → 2026-07-03**
> (re-ingesta EMITIDAS CORRECTAS, catálogo de categorías + clasificación masiva, hard-delete de
> facturas, cards de facturación por moneda/entidad en el Dashboard). Esta reingeniería **reemplaza**
> el modelo anterior (Sheets/n8n → Supabase). Donde haya conflicto con notas viejas, **manda este documento**.
>
> **Migraciones 23, 24, 25, 26 y 28 ya están APLICADAS** en el SQL editor por el usuario. `tsc`
> compila limpio al cierre de cada sesión.
>
> ⚠️ **Migraciones PENDIENTES de aplicar** por el usuario en el SQL editor: **27** (categorías, sección 12),
> **29** (días de crédito, sección 18) y **30** (truncar movimientos para recargar estados de cuenta
> PDF, sección 19). **Sesión 6 (2026-07-09)**: reingeniería del procesador de estados de cuenta de TXT
> a **PDF oficial BBVA** (parser por coordenadas); Edge Function ya desplegada, falta truncar + recargar.

## Goal

El módulo Financiero perdía datos en la ingesta: n8n (`CLASIFICADOR FACTURAS`) parseaba el CFDI con **regex sobre texto** y tiraba el **complemento de pago** (Pagos 2.0), el **complemento de nómina**, los **impuestos**, el **tipo de cambio** y el detalle de conceptos.

Objetivos de la reingeniería (los 3 cumplidos):
1. Modelo de datos que capture el CFDI 4.0 **sin pérdida**.
2. Sacar el procesamiento de n8n a **código en el repo** (Supabase Edge Function) — transparente y con contexto para LLMs.
3. **Re-ingestar** todo el histórico al modelo nuevo.

Stack: Vite + React 19 + TS + Supabase. Cliente en `src/lib/supabase.ts`. Proyecto Supabase ref `zzrnpuefuxvnhkipjxqn`. No hay Supabase CLI versionado: las migraciones se aplican **a mano en el SQL editor**.

---

## Current Progress

### 1. Modelo de datos — COMPLETADO ✅ (aplicado en SQL editor)

**`supabase/migrations/23_cfdi_modelo_completo.sql`** — autocontenida. Hace `DROP ... IF EXISTS` y **recrea** `facturas`, `movimientos_bancarios`, `conciliaciones` + vistas. Filosofía clave:

> **UNA fila de `public.facturas` == UN archivo XML completo.** Lo escalar va en columnas; lo anidado/repetido va en **columnas JSONB**. PKs **`SERIAL` (INT)**, NO UUID (para no confundir con `cfdi_uuid`). Conceptos NO se normalizan: se concatenan en `conceptos` (contexto LLM). [Preferencias del usuario guardadas en memoria `schema-design-preferences`.]

- **`facturas`** (PK `SERIAL`): columnas escalares (incl. nuevas `version`, `tipo_cambio`, `descuento`, `condiciones_pago`, `exportacion`, `lugar_expedicion`, regímenes/domicilio fiscal, `total_impuestos_trasladados/retenidos`, `archivo_origen`) + **JSONB**:
  - `impuestos` — `[{tipo, base, impuesto, tipo_factor, tasa_o_cuota, importe}]`
  - `complemento_pago` — `{totales, pagos:[{...campos pago, docs_relacionados:[{id_documento, serie, folio, moneda_dr, num_parcialidad, imp_saldo_ant, imp_pagado, imp_saldo_insoluto, ...}]}]}` ★ oro para conciliación
  - `nomina` — `{tipo_nomina, fechas, totales, empleado:{...}, percepciones:[], deducciones:[], otros_pagos:[]}`
  - `cfdi_relacionados` — `[{tipo_relacion, uuids:[]}]`
  - Índice GIN sobre `complemento_pago`.
- **`movimientos_bancarios`** (PK `SERIAL`): igual que antes, estados de cuenta BBVA MXN/USD.
- **`conciliaciones`** (PK `SERIAL`): `factura_id INT` y `movimiento_id INT` (antes UUID). FK `conciliado_por → profiles(id)`.
- **Vistas** (`security_invoker=on`):
  - `v_movimientos_bancarios` — estado de conciliación calculado (igual que migración 20).
  - `v_facturas_saldo` — **nuevo**: saldo de cada factura expandiendo `complemento_pago` (REP) con `jsonb_array_elements`. Reemplaza la adivinanza.

### 2. Parser CFDI determinista (compartido) — COMPLETADO ✅
**`supabase/functions/_shared/cfdi.mjs`** — `parseCfdiXml(xml, fileName) → fila de facturas`. Usa `fast-xml-parser` con `removeNSPrefix`. Mismo módulo lo usan la Edge Function (Deno) y el script de re-ingesta (Node) → **cero drift**. Sin LLM (la extracción de CFDI es 100% determinista).

### 3. Edge Function — DESPLEGADA ✅
**`supabase/functions/procesar-cfdi/index.ts`** (+ `deno.json` con import map). Recibe `{ files:[{name, xml}] }`, parsea y hace **upsert idempotente por `cfdi_uuid`** en `facturas`. Usa `SUPABASE_SERVICE_ROLE_KEY` (inyectado por Supabase). Devuelve `{processed, inserted, errors[]}`. **Ya desplegada por el usuario.**

### 4. Re-ingesta — COMPLETADA ✅
**`scripts/reingest.mjs`** (Node) leyó `rsc/emitidas` + `rsc/recibidas`, reutilizó el parser y cargó **1087 facturas** vía `service_role`. Idempotente (upsert por UUID, dedup en lote).
- Universo: 1091 XML → 1087 CFDI válidos (474 `I`, 462 `N` nómina, 139 `P` pagos, 12 `E` notas de crédito). 139 con `complemento_pago`, 462 con `nomina`, 340 con `impuestos`.
- Correr: `SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/reingest.mjs`

### 5. Frontend — COMPLETADO ✅
- **`Tablas/Facturas.tsx`** `handleClassify`: XML → `supabase.functions.invoke('procesar-cfdi')`; **PDF sigue yendo a n8n** (migración aplazada). Nuevo componente read-only **`ComplementosCFDI`** en el modal: muestra impuestos, complemento de pago (con documentos relacionados), nómina y CFDIs relacionados leyendo los JSONB. `handleSave` solo persiste campos de `FIELDS` (no toca los JSONB).
- **`Dashboard/utils.ts` + `index.tsx`**: el Dashboard **ya no usa RPC** (consulta `facturas` directo, **paginando de 1000 en 1000** para evitar el tope de PostgREST, agrega en código). Corrige semántica: Ingresos = emitidas tipo `I` (USD→MXN con `tipo_cambio`), Gastos = recibidas tipo `I`, **Nómina** = KPI nuevo (emitidas tipo `N`), IVA = `total_impuestos_trasladados` real, Balance = Ingresos − Gastos − Nómina.

### 5b. Pulido UI de `Tablas/Facturas.tsx` (sesión 2) — COMPLETADO ✅
Todo en `src/pages/Financiero/Tablas/Facturas.tsx`, sin cambios de DB ni de save:
- **Altura uniforme de filas**: columnas `emisor`/`receptor` ahora truncan a una línea (`nowrap` + `overflow:hidden` + `textOverflow:ellipsis`, `maxWidth 220px`) con `title` que muestra el valor completo en hover. Antes envolvían y crecían la fila.
- **UUID siempre en MAYÚSCULAS en el UI**: helper `upper()`. Aplicado al input `cfdi_uuid` (vía `textTransform:uppercase`, solo visual), a `docs_relacionados.id_documento` y a `cfdi_relacionados.uuids`.
- **Sección read-only `DatosOrigen`** en el modal (antes de `ComplementosCFDI`): muestra **toda columna escalar** de la fila que NO esté ya en el formulario editable (`FIELDS`) ni en los JSONB. **Es dinámica** (itera `Object.entries` de la fila), así que columnas nuevas del modelo aparecen solas. Cubre lo que faltaba ver: `tipo_cambio`, `version`, regímenes/domicilio fiscal, `descuento`, `condiciones_pago`, `exportacion`, `lugar_expedicion`, `total_impuestos_trasladados/retenidos`, `archivo_origen`, `created_at`. Formatea montos como moneda, fechas legibles, UUIDs en mayúsculas; oculta vacíos. Para la contadora.
- **Filtros server-side nuevos** en la tabla directa (todos `.eq/.gte/.lte`, combinan con AND, resetean página): Tipo CFDI (I/E/P/N/T con labels), Moneda, Emisor, Receptor y rango de Fecha (desde/hasta), + botón "Limpiar filtros" (aparece solo si hay filtro activo). Los dropdowns Emisor/Receptor/Moneda se pueblan con **valores distintos** cargados una vez al montar (paginando 1000 en 1000). Constantes `TIPO_CFDI_OPTIONS`, `selectStyle`; estado `tipoCfdiFilter/monedaFilter/emisorFilter/receptorFilter/fechaDesde/fechaHasta` + `emisores/receptores/monedas`.

### Datos fuente (gitignored)
`rsc/emitidas`, `rsc/recibidas` (XML), `rsc/estados-cuenta` (6 `.txt` BBVA MXN/USD). `rsc/` y `.tmp_xml/` están en `.gitignore`.

---

## What Worked

- **Tabla única + JSONB** (1 fila = 1 XML) en vez de 6 tablas hijas normalizadas: lo que el usuario pidió explícitamente; queda simple y no pierde nada.
- **Parser compartido `_shared/cfdi.mjs`** con import `fast-xml-parser` resuelto vía `deno.json` (Deno) y `node_modules` (Node): mismo código en Edge Function y script de carga.
- **Upsert por `cfdi_uuid`**: la re-ingesta es idempotente y segura de re-correr.
- **Validación local antes de tocar la DB**: se parsearon los 1091 archivos con Node y se inspeccionaron 3 casos de referencia (REP, USD tipo I, nómina) antes de cargar.
- **`v_facturas_saldo` expandiendo JSONB**: demuestra que el complemento de pago sigue siendo consultable aunque viva en JSONB.
- **`dedup_key` determinista** (mov. bancarios y PDFs): idempotencia sin UUID; índice único NO parcial para que funcione con `onConflict` de PostgREST.
- **Upsert directo desde el navegador** (RLS `FOR ALL` autenticados) en vez de Edge Function cuando el secret puede quedarse fuera (rama PDF: Hermes key vive en n8n).
- **Estado calculado en vistas** (`v_facturas_conciliacion`, `v_movimientos_bancarios`): el UI lee saldo/estado sin recomputar; alinea con la preferencia del usuario `[[schema-design-preferences]]`.
- **Componentes de detalle compartidos** (`components/FacturaDetalle.tsx`): un solo lugar para el modal de Facturas y Conciliación → cero drift.
- **NUNCA `await` Supabase dentro de `onAuthStateChange`** (deadlock, ver sección 10): diferir con `setTimeout(…,0)`.

## What Didn't Work / Decisiones explícitas

- **PKs `SERIAL`, no UUID** — el usuario rechazó UUID porque se confunde con `cfdi_uuid`.
- **Clasificación (`categoria`) APLAZADA** — la Edge Function solo parsea; `categoria` queda nullable/manual. NO meter LLM de categorización todavía.
- **PDF / nómina Deel** sigue en n8n (`oraculo-agent`) — migración a código es roadmap.
- **4 "XML" son acuses de cancelación** pipe-delimited (no CFDI). El parser los descarta con "No es un CFDI"; es normal, no son error.
- **RPCs viejos** (`dashboard_financiero` mig. 21, `candidatos_conciliacion` mig. 22) — el usuario los borró y **no le interesan**. El Dashboard ya no depende de ninguno. NO revivirlos.
- **PostgREST topa en 1000 filas**: confirmado. El Dashboard pagina; cualquier "traer todo" debe paginar.
- **`service_role` key se expuso en el chat** (2 veces: sesión 1, y de nuevo sesión 3 al correr `reingest-edos`, prefijo `sb_secret_Mqh…`) → ⚠️ **PENDIENTE rotarla** (Settings → API Keys → roll). El usuario quedó al tanto.
- **`banco` se deriva del NOMBRE del archivo**, no del contenido (el TXT no trae el banco). `metaArchivo()` en `_shared/edocuenta.mjs`: `/bbva/i` → `"BBVA"`, si no `null`. `moneda` igual (`/usd/i`|`/mxn/i`) pero **sí lanza error** si no matchea. Para soportar otros bancos (Santander/HSBC…) hay que ampliar ese regex. El dropdown de Banco en el UI solo aparece si hay >1 banco distinto.

## Estado de las 3 correcciones que pidió la contadora (revisado sesión 2)
1. **Multiplicar `tipo_cambio` × `total` al normalizar a MXN** — ✅ **HECHO**. Está en `toMXN` (`Dashboard/utils.ts`); solo convierte si `moneda` ≠ MXN/XXX **y** hay `tipo_cambio`. La tabla de Facturas muestra moneda original (correcto, ahí no se normaliza).
2. **Agregar `ORDENANTE` a la vista VoBo (conciliación)** — ⚠️ **DATO YA DISPONIBLE** (sesión 3). El parser de estados de cuenta (roadmap #1, ya hecho) guarda el concepto completo en `descripcion`/`referencia`, y el ORDENANTE viene embebido ahí (ej. USD: `ORDEN DE PAGO EXTRANJERO/...ORDENANTE: 36217105`). Falta solo **mostrarlo en el modal VoBo** cuando se retome Conciliación (no hay columna `ordenante` dedicada; vive en el texto del movimiento).
3. **Complemento de pago como "2do check"** — ⚠️ **PARCIAL**. Como **panel visual** (`ComplementosCFDI`) ✅ hecho. Como **check determinista dentro de la conciliación** ❌ pendiente (sería parte de la conciliación automática futura, que el usuario aplazó). La conciliación de sesión 3 es **manual**, no usa el REP como check.

### Edge cases del cálculo de Ingresos del Dashboard (discutidos, NO corregidos aún)
`totalIngresos` = Σ `toMXN` de filas `EMITIDA` + `tipo==='I'` (excluye P/N/E/T, correcto). Pendiente decidir si:
- Una emitida tipo `I` con **total 0** suma $0 al monto **pero sí incrementa `numFacturas`** (infla conteo y diluye ticket promedio). ¿Excluir del conteo?
- Una emitida tipo `I` en **USD sin `tipo_cambio`** se suma **sin convertir** (como si fuera MXN) → subvalúa ingresos. ¿Marcar/avisar para corregir, o asumir TC default?

## Next Steps

### 7. Conciliación bancaria MANUAL (sin IA) — COMPLETADO ✅ (sesión 3, 2026-06-30)
**Decisión explícita del usuario: NO meter IA por ahora.** El proceso de la contadora es desordenado; que ella resuelva a mano. Se **reescribió** `Conciliacion/index.tsx` quitando TODO lo de Hermes/IA (webhook `conciliador`, RPC `candidatos_conciliacion`, sugerencias, modal VoBo). Layout de 2 paneles:
- **Izquierda**: **todas** las facturas EMITIDAS (solo se excluyen las RECIBIDAS; **no** se filtra por `tipo`, decisión del usuario) desde la nueva vista **`v_facturas_conciliacion`** (`supabase/migrations/25_facturas_conciliacion_view.sql`, espejo de `v_movimientos_bancarios`: calcula `monto_conciliado`/`saldo_pendiente`/`estado_conciliacion`). Búsqueda + filtro de estado **server-side**. Cada fila tiene un botón **"Detalle"** (ícono ojo) que abre un **modal read-only** con todos los datos de la factura.
- **Derecha (workbench)**: card de la factura (cliente, fecha, total, saldo, `condiciones_pago`) + **selector multiselect de movimientos ABONO** (desde `v_movimientos_bancarios`), con filtros de ordenante/descripción, rango de fecha y toggle "ocultar ya conciliados". **SIN candado de moneda** (decisión del usuario: el cliente paga en la divisa que sea; la contadora ve TODOS los ABONOS y cruza raw). Cada movimiento seleccionado trae un **monto aplicado editable** (default = saldo libre) para pagos parciales. Barra de resumen: # seleccionados · suma · saldo factura · diferencia (avisa si excede; nota: con mezcla de divisas la suma es raw). "Conciliar N mov." hace **upsert** (onConflict `factura_id,movimiento_id`) → N filas en `conciliaciones`; la `moneda` guardada es la **del movimiento**, no la de la factura. Tabla de conciliaciones registradas con su **ordenante** (referencia) y botón eliminar.
- **El modelo `conciliaciones` NO cambió** — ya soportaba muchos-a-muchos (varios movimientos → 1 factura). Solo se agregó la vista.
- **Componentes de detalle extraídos** a `src/pages/Financiero/components/FacturaDetalle.tsx` (`ComplementosCFDI` + `DatosCompletos` + helpers). Antes vivían inline en `Tablas/Facturas.tsx` (como `ComplementosCFDI`/`DatosOrigen`); ahora ese archivo los **importa** del compartido → cero drift entre el modal de Facturas y el de Conciliación. `DatosCompletos` toma `skipKeys` opcional (Facturas le pasa las claves del form editable; Conciliación lo deja sin skip para ver todo).
- **Corrección #2 de la contadora (ORDENANTE)** → ✅ resuelta: el ordenante se muestra en cada fila de movimiento y en la tabla de conciliaciones registradas.
- **Pendiente de ejecución del usuario**: aplicar migración 25 (`v_facturas_conciliacion`) en el SQL editor.
- **`metodo`** queda siempre `'manual'` (el CHECK permite `auto`/`manual`; `auto` quedaría para una futura conciliación automática).
- **Migración 25 ✅ APLICADA** por el usuario.

### Roadmap (en orden de valor)
1. ~~**Estados de cuenta BBVA en código**~~ — ✅ **HECHO (sesión 3)**, ver sección 6.
2. ~~**Conciliación bancaria**~~ — ✅ **HECHO MANUAL (sesión 3)**, ver sección 7. La versión **automática determinista** con `complemento_pago`/`v_facturas_saldo` (el REP ya dice qué factura paga y cuánto) queda como mejora futura, NO ahora (decisión del usuario).
3. ~~**Migrar rama PDF/Deel**~~ — ✅ **HECHO (sesión 3)**, ver sección 8. (Se **reusó** el agente Hermes existente, no se migró a Claude.)
4. **Clasificación `categoria`**: cuando se retome, hacerla en Edge Function con Claude (decoplada de la ingesta).

### 6. Estados de cuenta BBVA en código — COMPLETADO ✅ (sesión 3, 2026-06-30)
Mismo patrón que `procesar-cfdi` (parser compartido + Edge Function + script de carga, cero drift):
- **`supabase/functions/_shared/edocuenta.mjs`** — `parseEdoCuenta(text, fileName) → rows[]`. Determinista, sin LLM. Formato BBVA: TSV **Latin-1**, header `Día\tConcepto / Referencia\tcargo\tAbono\tSaldo`. Deriva `moneda`+`banco` del **nombre del archivo** (ej. `202601-BBVA-MXN.txt`). Por fila: fecha `DD-MM-YYYY`→ISO; `cargo`→`CARGO`/`abono`→`ABONO` (excluyentes), `monto` siempre positivo; concepto se parte en `descripcion`/`referencia` por el primer `/`. Calcula `dedup_key` (`moneda|fecha|tipo|monto|saldo|concepto`) para upsert idempotente sin UUID.
- **`supabase/migrations/24_movimientos_dedup.sql`** — ADITIVA: agrega `dedup_key TEXT` + índice único `uq_movbanc_dedup` a `movimientos_bancarios`. **Aplicar a mano en SQL editor.**
- **`supabase/functions/procesar-edo-cuenta/index.ts`** (+ `deno.json`) — recibe `{ files:[{name, text}] }`, parsea, **upsert por `dedup_key`**. Usa `SUPABASE_SERVICE_ROLE_KEY`. Devuelve `{processed, inserted, errors[]}`. **Falta desplegar:** `supabase functions deploy procesar-edo-cuenta`.
- **`scripts/reingest-edos.mjs`** (Node) — carga `rsc/estados-cuenta` vía service_role, leyendo **latin1**. Idempotente. Correr: `SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/reingest-edos.mjs`. Validado local: **314 movimientos** (6 archivos), 0 colisiones de dedup, 0 montos/fechas inválidos.
- **Frontend `Tablas/MovimientosBancarios.tsx`** `handleUpload`: TXT → `functions.invoke('procesar-edo-cuenta')` decodificando **Latin-1** con `TextDecoder('iso-8859-1')` (NO `f.text()`, que asume UTF-8 y corrompe acentos). Ya no postea al webhook n8n `normalizador-edos-cuenta`. `.xlsx` quedó como "no soportado aún" (los export reales son `.txt`).
- **Filtros server-side en la tabla directa** (mismo patrón que Facturas, todos `.eq/.gte/.lte`, AND, resetean página): Moneda y Tipo (ya existían) + **Banco** (dropdown, solo si >1 banco), **Archivo origen** (ver un estado de cuenta a la vez), **rango Fecha** (desde/hasta) y **rango Monto** (mín/máx), + botón "Limpiar filtros". `bancos`/`archivos` se cargan como valores distintos al montar (paginando 1000 en 1000). Helper `selectStyle`, `hasFilters`, `clearFilters`.
- **Ejecutado por el usuario (sesión 3)**: ✅ migración 24 aplicada, ✅ Edge Function desplegada, ✅ re-ingesta corrida → **314 movimientos** cargados (0 errores, 0 duplicados). Verificado.

### 8. Rama PDF (Hermes/Oráculo) con upsert en la app — COMPLETADO ✅ (sesión 3, 2026-06-30)
**Decisión del usuario: REUSAR el agente Hermes existente** (`/Users/assef/Repos/@hazu-low-code-solutions/oraculo-agent`, endpoint `https://api.oraculo.hazu.bot/v1/chat/completions`), **no** migrar a Claude. El agente "Oráculo" recibe el **texto** del PDF (no base64 — lo descartaron por lento) y devuelve un **array JSON** con campos 1:1 a las columnas de `facturas` (1 fila por invoice regular; N filas por nómina Deel/Bimetriks). Contrato completo en el `HANDOFF.md`/`SOUL.md` de ese repo.
- **Arquitectura nueva**: el PDF sigue yendo a **n8n** (que ya hace Extract from File + llamada a Hermes), pero **n8n deja de insertar y devuelve el array**; el **upsert se hace en la app** (navegador, con la sesión del usuario — RLS de `facturas` es `FOR ALL` autenticados, igual que ya hace `handleSave`). Así la **API key de Hermes se queda en n8n**; NO se necesitó Edge Function ni secret nuevo.
- **`supabase/migrations/26_facturas_pdf_dedup.sql`** — ADITIVA: `dedup_key TEXT` + índice único NO parcial `uq_facturas_dedup`. Los PDF no traen `cfdi_uuid`, así que se deduplican por `dedup_key = PDF|emisor|folio|fecha|total|conceptos`. XML siguen con `dedup_key` null (deduplicados por `cfdi_uuid`; el índice único permite múltiples null). **Aplicar a mano en SQL editor.**
- **Frontend `Tablas/Facturas.tsx`** `handleClassify` rama PDF: postea a `N8N_PDF_WEBHOOK` (const editable, hoy `.../oraculo/clasificador-facturas`), parsea el array (defensivo: array directo o `{rows|data}`, strip de fences), **whitelistea** las columnas del contrato (`PDF_FACTURA_COLS` — ignora extras como `categoria_id` para no romper el INSERT), fuerza `formato_origen='PDF'`, calcula `dedup_key` y hace `upsert(onConflict:'dedup_key')`. Filas con `{error}` se reportan, no se insertan. `categoria` queda null (aplazada).
- **Migración 26 ✅ APLICADA** por el usuario.
- **Clasificador de `categoria` YA integrado en n8n** (sesión 3): el workflow ahora tiene `Webhook → Convert binary → PDF to text → HTTP (Hermes) → Parse output → Category classifier (Ollama) → Parse response → Merge categoría → Respond to Webhook`. El nodo **`Merge categoría`** (Code, Run Once for All Items) hace **zip por índice** de `Parse output` (filas Hermes) con `Parse response` (`categoria_nombre`) y `Respond to Webhook` usa **"All Incoming Items"** → devuelve el array directo. La app **sí persiste `categoria`** (se agregó a `PDF_FACTURA_COLS`). ⚠️ El `N8N_PDF_WEBHOOK` en el código apunta a `/webhook/` (prod); el usuario lo tenía en `/webhook-test/` para pruebas — confirmar que quede en `/webhook/` y el workflow **activo** en producción.
- **Pendiente de VERIFICACIÓN end-to-end**: subir un PDF real (Hetzner=1 fila; Deel=N filas) y confirmar filas + `categoria` + dedup (re-subir no duplica). Aún NO probado con datos reales.
- **`metodo_pago='PUE'`, `rfc_emisor='XEXX010101000'`** y demás defaults los pone Hermes, no la app. La Bearer key de Hermes vive **solo en n8n**.

### 9. Dashboard — sección "Cuentas por Cobrar" (CxC) — COMPLETADO ✅ (sesión 3, 2026-06-30)
Enfocada en las preguntas del director (Darold): *¿quién nos debe?, ¿cuánto entra hoy / al 15 / este mes?*. Todo se calcula en código desde la vista **`v_facturas_conciliacion`** (el Dashboard cambió su fuente de `facturas` a esa vista para tener `saldo_pendiente`/`estado_conciliacion`).
- **Es un snapshot "ahora"**: la CxC se computa sobre TODO el universo (EMITIDA `tipo='I'` con `saldo_pendiente>0`), **NO** depende del filtro de mes del Dashboard (sí afecta a los KPIs/gráficas generales de arriba).
- **KPIs**: Por cobrar total (+ # facturas/# clientes), Vencido, Vence hoy, De aquí al 15, Este mes.
- **Gráficas**: "Quién nos debe" (barras horizontales top clientes por saldo), "Antigüedad de saldos" (doughnut 0–30/31–60/61–90/90+ desde emisión), "Cobranza esperada por vencimiento" (Vencido/Hoy/Próx.7d/Resto del mes/Después).
- **Tabla**: facturas por cobrar, más vencidas primero, con estatus (Vencida Nd / Vence hoy / En Nd) y saldo.
- **Vencimiento estimado** = `fecha + díasCredito(condiciones_pago)`. `diasCredito` parsea el primer número de `condiciones_pago` ("30 days"→30, "contado"/"PUE"→0); **si no hay dato usa `DEFAULT_DIAS_CREDITO=30`**. ⚠️ Por eso la cobranza por fecha es **estimada** (el dato fino de días de crédito por cliente no vive aún en la DB — sería el módulo de aging que mencionó el usuario). El saldo se normaliza a MXN con `tipo_cambio`.
- Todo en `Dashboard/utils.ts` (tipos `CuentasPorCobrar` etc. + cómputo) y `Dashboard/index.tsx` (KPIs/charts/tabla, chart.js).

### 10. Fix: deadlock de auth (app colgada al cargar) — COMPLETADO ✅ (sesión 3, 2026-07-02)
**Síntoma**: la app desplegada se quedaba "colgada" al cargar — navegable, pero NINGUNA query de Supabase (tablas, vistas) resolvía; recargar con cmd+R la destrababa.
**Causa**: en `src/contexts/AuthContext.tsx`, el callback de `supabase.auth.onAuthStateChange` era `async` y hacía `await fetchProfile()` (query a `profiles`) **adentro**. El callback corre con el lock interno de auth tomado; una query que espera el token se queda esperando ESE MISMO lock → **deadlock**. Gatillo típico: evento `TOKEN_REFRESHED` poco después de cargar (token por expirar). Recargar lo evitaba porque disparaba `INITIAL_SESSION` (que se ignora) en vez del refresh.
**Fix**: el callback ahora es **síncrono** (sin `async`/`await`); setea session/user y **difiere `fetchProfile` FUERA del lock** con `setTimeout(…, 0)`. Antipatrón documentado de Supabase: nunca `await` de llamadas a Supabase dentro de `onAuthStateChange`. **Requiere REDESPLEGAR** para que tome efecto.

---

## SESIÓN 4 (2026-07-02 → 2026-07-03)

### 11. Re-ingesta "EMITIDAS CORRECTAS" — COMPLETADO ✅
El usuario **truncó `public.facturas`** y recargó los XML corregidos con `scripts/reingest.mjs` (mismo script de sesión 1, acepta rutas como args):
- `node scripts/reingest.mjs 'rsc/EMITIDAS CORRECTAS'` → **1112 XML, 0 errores de parseo, 1112 upsert** (por `cfdi_uuid`).
- `node scripts/reingest.mjs 'rsc/recibidas'` → 313 XML, **309 upsert** (4 descartados: acuses de cancelación pipe-delimited, "No es un CFDI" — normal).
- Total tras recarga: **~1586 filas** en `facturas`. Emitidas: 1112 (todas XML, emisor único **STORE INTELLIGENCE / RFC `SIN1304305B9`**). ⚠️ Nota: `rsc/EMITIDAS CORRECTAS` tiene **espacio final** en el nombre real de la carpeta pero el script funciona con o sin él.
- ⚠️ **`service_role` key expuesta de nuevo** en el chat (prefijo `sb_secret_Mqh…`) al correr la re-ingesta y las queries de descubrimiento → sigue pendiente rotarla.

### 12. Catálogo de categorías (labels) + clasificación masiva — COMPLETADO ✅ (⚠️ falta aplicar migración 27)
Requerimiento: clasificar el campo `categoria` en **lote** desde la tabla directa, eligiendo de una **lista predefinida** que el usuario (la contadora) crea, **PERO sin integridad referencial** — `facturas.categoria` sigue siendo **texto abierto**; el catálogo solo alimenta el dropdown (no se escribe libre al clasificar).
- **`supabase/migrations/27_categorias_factura.sql`** — ADITIVA, **PENDIENTE de aplicar**. Crea `public.categorias_factura` (PK SERIAL, `nombre` TEXT UNIQUE, `color` TEXT, `created_at`) + RLS `FOR ALL` autenticados. **Sin FK** hacia `facturas`: borrar/renombrar una categoría NO toca las facturas ya clasificadas.
- **`Tablas/Facturas.tsx`**:
  - Botón **"Categorías"** en el header → modal para crear (nombre + color de paleta) / listar / borrar labels (`categorias_factura`).
  - **Multiselect de filas**: checkbox por fila + "seleccionar toda la página"; la selección **persiste entre páginas** (Set de ids).
  - **Barra de clasificación masiva** (aparece con selección): dropdown de categorías predefinidas + **Aplicar** (`update({categoria}).in('id', ids)`), **Quitar categoría** (set null), limpiar selección.
  - Campo `categoria` en el **modal de edición** → ahora es **select del catálogo** (no texto libre); si la factura trae un valor fuera de catálogo, se conserva como opción.
  - Columna Categoría se muestra como **badge con el color** de la label.
  - Import nuevo de `ConfirmModal` desde `../../../components/Modals`.

### 13. Hard-delete de facturas — COMPLETADO ✅
El usuario pidió primero un **soft-delete** (columna `estatus` cancelada + trazabilidad + exclusión global en dashboard/conciliación/vistas) y se implementó (migración 28 + cambios de front), **pero luego lo cambió a HARD-DELETE**. Se **revirtió todo lo del soft-delete** y se **eliminó la migración 28** (nunca se aplicó):
- **`Tablas/Facturas.tsx`**: botón **"Eliminar factura"** (rojo, `Trash2`) en el footer del modal → `supabase.from('facturas').delete().eq('id', ...)` con `ConfirmModal` destructivo (muestra folio + total). Al confirmar: quita la fila de la lista, decrementa el total y la saca de la selección múltiple.
- **No hay columna `estatus`**: al borrarse físicamente, la factura deja de existir → automáticamente no cuenta en dashboard/conciliación/totales, **sin filtros ni vistas extra**. NO revivir la idea de `estatus`/migración 28 salvo que el usuario pida trazabilidad de borrados.

### 14. Dashboard — cards "Facturación por moneda / entidad" — COMPLETADO ✅ (⚠️ regla por confirmar)
3 cards nuevas ("què se facturó", **emitidas de ingreso tipo `I`, SIN conversión**, en moneda nativa), respetan el filtro de **mes** (no el de emitidas/recibidas):
- **Facturado MXN** — `$13,335,293.05` (104 fac.)
- **Facturado USD · SA de CV** — `$57,872.84` (24 fac.)
- **Facturado USD · AMERICAS LLC** — `$829,595.83` (166 fac.)
- **`Dashboard/utils.ts`**: interface `FacturacionInsights` + cómputo en `fetchDashboard` (pasa sobre `all`, filtra mes + EMITIDA tipo I). Nuevo `formatUSD`.
- **`Dashboard/index.tsx`**: sección "Facturación por moneda" con 3 `KpiCard` (iconos `Banknote`/`DollarSign`/`Globe`).
- ⚠️ **SUPUESTO CLAVE por confirmar con el usuario**: en la data **NO existe** la entidad "STORE INTELLIGENCE AMERICAS LLC" por nombre — **todas** las emitidas las emite la SA de CV (RFC `SIN1304305B9`). Se separó el USD por el **RFC del receptor**: `XEXX010101000` (extranjero, todo Nestlé LATAM) = **AMERICAS LLC**; RFC mexicano (MARCAS NESTLE, DELIMEX) = **SA de CV**. La regla está **centralizada** en `utils.ts` (`RFC_RECEPTOR_EXTRANJERO` / `esAmericasUSD`) para cambiarla en una línea. El usuario dijo que la distinción aplica **a emitidas y recibidas** y que "ya hay algunas de AMERICAS cargadas" — pero no aparecen por nombre ni por otro RFC. **Confirmar la regla real** (¿lista de clientes/RFC?, ¿emisor distinto cuando cargue esas facturas?) antes de darla por buena.

---

## SESIÓN 5 (2026-07-07)

Todo en `src/pages/Financiero/Tablas/Facturas.tsx` salvo lo indicado. `npx tsc -b` compila limpio al cierre.

### 15. Timeout del webhook n8n al procesar PDF — COMPLETADO ✅
El `fetch` a `N8N_PDF_WEBHOOK` (rama PDF de `handleClassify`) no tenía timeout explícito (usaba el del navegador → podía colgarse indefinido). Se agregó:
- Constante `N8N_PDF_TIMEOUT_MS = 300_000` (**5 min** — la extracción pasa por Hermes/LLM y puede tardar con varios PDF). Único punto a ajustar.
- `AbortController` + `setTimeout(ctrl.abort, …)`, con `clearTimeout` en `finally` y mensaje claro si vence (`El procesamiento de PDF superó el tiempo de espera (300s)`).

### 16. Fix dedup PDF: "ON CONFLICT DO UPDATE cannot affect row a second time" — COMPLETADO ✅
Al subir una **nómina** (ej. Bimetriks), n8n devolvía filas **100% idénticas** (dos consultores cobrando lo mismo → mismo `dedup_key = PDF|emisor|folio|fecha|total|conceptos`). El upsert con `onConflict` fallaba porque Postgres no permite tocar la misma fila dos veces en un comando. **Agregar otro campo de contenido NO ayuda** (las filas no traen nada que las distinga). Solución:
- **`withOccurrenceIndex(rows)`** (helper junto a `pdfDedupKey`): cuando una `dedup_key` base se repite dentro del lote, agrega sufijo `|#1`, `|#2`… La 1.ª ocurrencia queda **sin sufijo** (no rompe llaves ya persistidas). El orden del PDF es estable → re-subir reproduce las mismas llaves (idempotente).
- El upsert de PDF pasó a **`ignoreDuplicates: true`** (`ON CONFLICT DO NOTHING`): re-subir omite duplicados sin sobrescribir (preserva `categoria` puesta a mano) **y** evita que el upload requiera permiso de UPDATE (reservado a la whitelist, ver #17).
- ⚠️ **Limitación honesta**: el índice de ocurrencia depende del orden en que n8n devuelve las filas; si un reprocesamiento cambia orden/número de líneas, las llaves `#n` podrían recorrerse y generar algún duplicado. Trade-off aceptable frente a un UUID aleatorio (que rompería el dedup).

### 17. Whitelist de edición de facturas — COMPLETADO ✅ (migración 28 APLICADA por el usuario)
Requerimiento: el acceso al **módulo Financiero = solo LECTURA** de facturas; solo usuarios en una **whitelist** pueden editar. **Decisiones del usuario** (vía preguntas): (a) whitelist = **flag por usuario `profiles.can_edit_facturas`**, es el ÚNICO criterio — **incluso los `role='admin'` necesitan el flag** (no es bug, no lo "arregles"); (b) operaciones restringidas = **editar registro, eliminar, clasificar en masa** (subir XML/PDF queda **abierto** a cualquier autenticado); (c) enforcement = **Frontend + RLS** (real, no solo cosmético).

- **`supabase/migrations/28_facturas_edit_whitelist.sql`** (⚠️ reusa el número 28 que quedó libre al borrarse el soft-delete de sesión 4, sección 13 — no confundir). **APLICADA por el usuario.** Contenido:
  - `ALTER TABLE profiles ADD COLUMN can_edit_facturas boolean` (sin default; `NULL` = no puede editar).
  - **RLS de `facturas` reescrito**: se borró la policy `FOR ALL` y se dividió → **SELECT** e **INSERT** abiertos a autenticados (ver + subir); **UPDATE** y **DELETE** solo si `(SELECT can_edit_facturas FROM profiles WHERE id = auth.uid()) IS TRUE`. (Editar y clasificar en masa son UPDATE; hard-delete es DELETE.)
  - **Trigger `protect_privileged_profile_columns`** (BEFORE UPDATE en `profiles`) — cierra una **escalada de privilegios PREEXISTENTE**: la policy `"Users can update own profile"` (`FOR UPDATE USING (auth.uid()=id)`) no restringía columnas, así que cualquiera podía auto-asignarse `role='admin'`/`modules`/`can_edit_facturas` por la API. El trigger impide a NO-admins cambiar esas 3 columnas. **Corregido en la misma sesión**: bypass cuando `auth.uid() IS NULL` (service role / editor SQL / migraciones) — sin eso, el usuario se auto-bloqueó al correr SQL en el editor (`P0001: No autorizado…`). Un usuario logueado desde la app SIEMPRE tiene `auth.uid()`, así que la protección sigue intacta para ellos.
- **`src/contexts/AuthContext.tsx`**: `UserProfile` ahora incluye `can_edit_facturas?: boolean` (ya venía en `select('*')`).
- **`Tablas/Facturas.tsx`**: `const canEdit = profile?.can_edit_facturas === true` (vía `useAuth`). Gating: casillas de selección (fila + "toda la página"), barra de clasificación masiva, botones **Guardar/Eliminar** del modal e inputs del modal (deshabilitados; título pasa a **"Ver factura"**). Handlers `handleSave`/`handleDeleteFactura`/`applyBulkCategoria` con early-return `if (!canEdit)`. `colSpan` del estado vacío ajustado a `COLUMNS.length + (canEdit ? 1 : 0)`.
- **`src/pages/Admin/index.tsx`**: nueva columna **"Editar facturas"** con checkbox por usuario (`handleUpdateUser({ can_edit_facturas })`); solo admins pueden togglearlo (RLS + trigger). `colSpan` de loading/empty corregidos a 6. `Profile` incluye el campo.
- **Aplicado por el usuario en SQL editor**: ✅ migración 28 completa, ✅ función del trigger corregida (bypass `auth.uid() IS NULL`), ✅ `UPDATE profiles SET can_edit_facturas=true WHERE email='fernando@cassia.solutions'`.
- ⚠️ **PENDIENTE de verificación end-to-end** (ver Next Steps): recargar la app (el flag se lee en `fetchProfile` al login), probar edición como whitelisted y solo-lectura como no-whitelisted. Confirmar que `fernando@cassia.solutions` es el correo real de acceso del usuario (en el perfil de sistema figura `fernandoassef@hotmail.com`).
- Memoria guardada: `facturas-edit-whitelist` (decisión "incluso admins necesitan el flag").

### 18. Módulo "Cuentas por Cobrar" (CxC) con catálogo de días de crédito — COMPLETADO ✅ (⚠️ falta aplicar migración 29)
Página **aislada** dentro de Financiero (`/financiero/cuentas-por-cobrar`, link en el Sidebar con `HandCoins`) que sustituye la CxC **estimada** (default 30) por el **término de crédito REAL por cliente**. Responde: *¿cuánto se espera cobrar en el mes X y quién debe?*
- **Regla central**: `fecha_estimada_pago = fecha_emisión + dias_credito[receptor]`; el saldo se **bucketiza por el MES de esa fecha**. El filtro de mes selecciona por mes de cobro (no de emisión): si un cliente no pagó, su saldo "cae" en su mes esperado y ahí se queda hasta conciliar. La ventana "15–167 días atrás" que mencionó el usuario NO se hardcodea — es el **mín/máx del catálogo**, derivado en vivo (`rango` en `utils.ts`) y mostrado en el header.
- **Matching (decisión del usuario)**: `catalogo.cliente` contiene **exactamente** el texto de `facturas.receptor` (p.ej. `NESTLE DE PURINA` == receptor). Cruce por **NOMBRE normalizado** (`upper(btrim(...))`), **NO por RFC**. Receptor fuera del catálogo → **SIN término**: se **segrega** en un card "Sin término de crédito" (saldo/#fac/#clientes) y el modal del catálogo sugiere esos receptores como chips para completarlos (default 30 **descartado** por el usuario: prefiere ver el hueco).
- **`supabase/migrations/29_catalogo_dias_credito.sql`** (ADITIVA, **PENDIENTE de aplicar**): tabla `public.catalogo_dias_credito` (PK SERIAL, `cliente` TEXT, `dias_credito` INT — 0=contado, `created_at`; índice único **case-insensitive** `upper(btrim(cliente))`; RLS `FOR ALL` autenticados, mismo patrón que `categorias_factura`). + Vista **`v_cuentas_por_cobrar`** (`security_invoker=on`): EMITIDAS `tipo='I'` con `saldo_pendiente>0.005`, **LEFT JOIN** al catálogo por nombre normalizado; deriva `dias_credito`/`fecha_estimada_pago`/`mes_estimado_pago` (NULL si sin término). La normalización a MXN + agregación se hacen en código (mismo patrón que el Dashboard).
- **Frontend nuevo**: `src/pages/Financiero/CuentasPorCobrar/utils.ts` (fetch paginado de la vista, `buildMes()` puro, CRUD del catálogo `fetch/add/update/deleteCatalogo`) + `index.tsx` (filtro de mes con default = **mes actual** si hay datos; KPIs Esperado/Vencido/Vigente/**Sin término**; "Quién nos debe este mes"; tabla detalle con estatus Vencida/Vence hoy/Vence en Nd; **modal CRUD** del catálogo con alta rápida, edición inline, borrado con `ConfirmModal`, y chips de sugerencias de receptores sin término). Ruta en `App.tsx`, link en `FinancieroLayout/Sidebar.tsx`.
- **CRUD del catálogo abierto a cualquier autenticado** (RLS `FOR ALL`, como `categorias_factura`) — NO se ató a la whitelist `can_edit_facturas` (esa es solo para `facturas`). Si se quiere restringir, gatear por `can_edit_facturas` como en `Tablas/Facturas.tsx`.
- `npx tsc -b` compila limpio. **Pendiente de verificación end-to-end**: aplicar migración 29, capturar el catálogo real (imagen que mandó el usuario: NESTLE DE PURINA 60, GRUPO MC TREE 0, 123LEASE 30, … SYNFINY ADVISORS 167, BEBIDAS PURIFICADAS 120, etc.) y confirmar que los receptores cruzan (los que no, saldrán en "Sin término").
- ⚠️ El `tmpfs` del harness (`/private/tmp/claude-501/.../tasks`) se llenó (ENOSPC) a mitad de sesión; se limpió. Si `tsc`/`vite` fallan por ENOSPC, limpiar ese dir o exportar `TMPDIR` a disco con espacio.

---

## SESIÓN 6 (2026-07-09)

### 19. Estados de cuenta: reingeniería de TXT → **PDF oficial BBVA** — COMPLETADO ✅ (⚠️ falta truncar + recargar)
Los estados de cuenta ahora llegan como el **PDF oficial de BBVA** (fuente original sin modificar), no como los TXT/TSV inconsistentes de antes. Se **reescribió por completo** el procesador de estados de cuenta (sección 6 quedó **obsoleta**: ya NO es TXT Latin-1, ya NO deriva banco/moneda del filename, ya NO usa `TextDecoder('iso-8859-1')`).

**Hallazgo clave que definió el diseño**: en el PDF, *Cargos* y *Abonos* son **dos columnas por posición horizontal (X)**; al extraer texto plano se confunden (ej. `INTERESES GANADOS 18.72` = abono y `I.S.R. RETENIDO 18.72` = cargo se ven idénticos). Por eso el parser es **basado en coordenadas**: clasifica cada monto según bajo qué columna cae, usando el **borde derecho** del número (`x + width`) contra la X de las etiquetas del header (`CARGOS`/`ABONOS`/`OPERACI`/`LIQUIDACI`), que **se repiten en cada página** y permiten autocalibrar.

**Arquitectura** (mismo principio de parser compartido, cero drift): el **frontend/script extraen** los ítems del PDF con **`pdfjs`** (bytes→items con coordenadas) y la **Edge Function parsea** con el módulo compartido (lógica pura, sin pdfjs en Deno). Así el server sigue haciendo la lógica determinista y se evita correr pdfjs en Deno.

- **`supabase/functions/_shared/edocuenta.mjs`** — reescrito. Ahora exporta:
  - `itemsFromTextContent(tc)` — mapea el `getTextContent()` de pdfjs a `{x, y, right, s}` (puro, sin pdfjs; lo usan browser y Node idéntico).
  - `parseEdoCuenta(pages, fileName)` — `pages` = items por página. Deriva **moneda** (`MONEDA NACIONAL`→MXN / `MONEDA DOLARES`→USD, con fallback al filename), **No. de cuenta** y **año del periodo** del **texto de la página 1** (ya NO del filename). Agrupa ítems en filas por Y, detecta inicio de transacción (`DD/MMM` en la col. izquierda), acumula líneas de referencia multi-línea, clasifica montos por columna. Guarda **saldo** de liquidación (aparece solo en el último movimiento de cada día). `dedup_key` = `cuenta|moneda|fecha|tipo|monto|descripción|referencia` (incluye referencia+descripción porque un día puede repetir monto/tipo; ej. varias `IVA TRANSF RECEPCION INT 4.80` que solo difieren en la referencia).
- **`supabase/functions/procesar-edo-cuenta/index.ts`** — nuevo contrato `{ files:[{ name, pages }] }` (items ya extraídos); parsea con el compartido, upsert por `dedup_key`. **YA DESPLEGADA por el usuario** (`supabase functions deploy procesar-edo-cuenta`, sesión 6).
- **`Tablas/MovimientosBancarios.tsx`** — acepta **`.pdf`** (antes `.txt`/`.xlsx`). Helper `extractPdfPages()` usa `pdfjs-dist` (worker vía `import ...?url`), extrae items por página y postea `{ files:[{name, pages}] }`. Se quitó todo lo de Latin-1/TXT.
- **`scripts/reingest-edos.mjs`** — usa `pdfjs-dist/legacy` + `itemsFromTextContent`; default apunta a **`rsc/estados-cuenta-correctos`** (los PDF correctos); walk de `.pdf`. Correr: `SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/reingest-edos.mjs`.
- **`pdfjs-dist@^4.10.38`** agregado a `dependencies` (package.json).
- **`supabase/migrations/30_reset_movimientos.sql`** (⚠️ numerada **30** — el 26 ya lo ocupa `26_facturas_pdf_dedup.sql`) — DESTRUCTIVA, **PENDIENTE de aplicar**: `TRUNCATE conciliaciones, movimientos_bancarios ... CASCADE` para recargar 100% limpio desde los PDF.
- **Validado local (parser de producción)** contra los **12 PDFs** de `rsc/estados-cuenta-correctos`: los conteos CARGO/ABONO cuadran **exactamente** con el resumen "Comportamiento" de la página 1 de cada estado (validación de oro), fechas ISO OK, moneda/cuenta bien detectadas, saldos capturados. **623 movimientos** en total, 0 errores. `tsc -p tsconfig.app.json` compila limpio.
- **Pendiente de ejecución del usuario**: (a) correr la migración 30 en el SQL editor (truncar); (b) recargar — por la UI (subir los `.pdf`) o `node scripts/reingest-edos.mjs`. La Edge Function ya está desplegada.
- ⚠️ El TXT viejo ya NO se soporta (los estados ahora son PDF). `rsc/estados-cuenta` (TXT viejos) quedó obsoleto; los correctos están en `rsc/estados-cuenta-correctos`.

---

## Pendientes reales (Next Steps)

**Verificación / operación:**
0. ⚠️ **Verificar whitelist de facturas end-to-end** (sesión 5, sección 17): recargar la app (el flag se lee en login) → como `fernando@cassia.solutions` confirmar que puede editar/eliminar/clasificar; como un colaborador CON acceso a Financiero pero SIN el flag confirmar solo-lectura ("Ver factura", sin botones). Confirmar que ese email es el de acceso real (perfil de sistema dice `fernandoassef@hotmail.com`). Migración 28 + trigger corregido YA aplicados.
1. ⚠️ **Aplicar migración 27** (`categorias_factura`) en el SQL editor — el catálogo de categorías y la clasificación masiva NO funcionan hasta aplicarla (sección 12).
1b. ⚠️ **Aplicar migración 29** (`catalogo_dias_credito` + vista `v_cuentas_por_cobrar`) en el SQL editor — el módulo Cuentas por Cobrar NO carga hasta aplicarla; luego capturar el catálogo real desde la propia página (sección 18).
1c. ⚠️ **Estados de cuenta PDF: truncar + recargar** (sesión 6, sección 19). La Edge Function ya está desplegada. Falta: (a) correr migración **30** (`TRUNCATE conciliaciones, movimientos_bancarios ... CASCADE`) en el SQL editor; (b) recargar limpio desde los PDF — por la UI (subir `.pdf` en Movimientos Bancarios) o `SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/reingest-edos.mjs` (procesa `rsc/estados-cuenta-correctos`, ~623 movimientos).
2. ⚠️ **Confirmar la regla SA de CV vs AMERICAS LLC** de las cards de facturación (sección 14) — hoy es un supuesto por RFC del receptor extranjero; ajustar `esAmericasUSD` en `Dashboard/utils.ts` si la regla real es otra.
3. **Verificar la rama PDF end-to-end** (sin probar): subir Hetzner (1 fila) y Deel (N filas), confirmar `categoria` y dedup. Dejar `N8N_PDF_WEBHOOK` en `/webhook/` y el workflow n8n **activo**.
4. **Redesplegar** para tomar el fix del deadlock de auth (sección 10).
5. ⚠️ **Rotar la `service_role` key** (se expuso en el chat varias veces, incl. sesión 4) — Settings → API Keys → roll.

**Features:**
4. ~~**Módulo Clientes + días de crédito**~~ — ✅ **HECHO (sesión 5, sección 18)**: módulo Cuentas por Cobrar con catálogo `catalogo_dias_credito` y vista `v_cuentas_por_cobrar`. La CxC del **Dashboard** sigue siendo estimada (default 30); si se quiere, migrarla a usar el catálogo real (o dejar el aging fino en la página nueva). Falta aplicar migración 29 + capturar catálogo.
5. **Clasificación `categoria` para XML**: hoy solo los PDF se clasifican (vía n8n). Los XML pasan por `procesar-cfdi` y quedan con `categoria` null.
6. **Conciliación automática determinista** (aplazada por el usuario): usar `complemento_pago`/`v_facturas_saldo` (el REP ya dice qué factura paga y cuánto) — sin IA. El modelo y las vistas ya lo permiten.
7. **Edge cases del Dashboard** (sin corregir): emitida tipo `I` con total 0 infla `numFacturas`; USD sin `tipo_cambio` se suma sin convertir.
8. **Estados de cuenta**: solo **`.pdf`** oficial BBVA (sesión 6). El TXT/TSV viejo y `.xlsx` ya no se soportan; otros bancos requerirían adaptar la detección de moneda/cuenta y los anclajes de columna del header.

### Cómo verificar el estado actual
- App: `npm run dev` → Financiero:
  - **Dashboard** → KPIs generales (Nómina, IVA real) + **"Facturación por moneda"** (3 cards MXN/USD SA de CV/USD AMERICAS) + sección **Cuentas por Cobrar** (KPIs Vencido/Hoy/al 15/mes, gráficas por cliente/aging/cobranza, tabla). Nota: con 0 conciliaciones todo sale como "vencido" (correcto).
  - **Facturas** → abrir factura tipo `P`/`N` → panel "Datos completos" + "Complementos del CFDI"; barra de filtros; botón **"Categorías"** (crea/lista labels — requiere migración 27); **multiselect + clasificación masiva**; **"Eliminar factura"** (hard-delete) en el modal; botón subir (XML→Edge Function, PDF→n8n).
  - **Movimientos Bancarios** → filtros (Banco/Archivo/Fecha/Monto); subir estados de cuenta **`.pdf`** BBVA (sesión 6; parser por coordenadas). Tras truncar+recargar los 12 PDF de `rsc/estados-cuenta-correctos` → **~623 movimientos**.
  - **Conciliación** → elegir factura EMITIDA → multiselect de ABONOS → conciliar; botón "Detalle" abre modal read-only.
- DB: `select tipo, count(*) from facturas group by tipo;` (tras recarga sesión 4: emitidas = 1112 XML; recibidas = 309); `select count(*) from movimientos_bancarios;` (≈ 623 tras recargar los PDF de sesión 6; migración 30); `select * from v_facturas_conciliacion limit 5;`. Categorías: `select * from categorias_factura;` (tras aplicar migración 27).
- `npx tsc -b` compila limpio (verificado al cierre de sesión 4).
