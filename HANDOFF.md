# HANDOFF — Módulo Financiero: Facturas + Conciliación Bancaria

## Goal

Migrar el pipeline contable de Google Sheets a Supabase (Postgres) para poder:
1. Cruzar facturas (emitidas y recibidas) contra estados de cuenta bancarios (conciliación).
2. Visualizar correctamente en el Dashboard financiero (`src/pages/Financiero/Dashboard/`).

---

## Current Progress

### Modelo de datos — COMPLETADO ✅
Migración `supabase/migrations/20_facturas_conciliacion.sql` aplicada en Supabase (SQL Editor, rol Developer).

Tablas creadas:
- **`public.facturas`** — espeja el concentrado del Sheet. Columnas clave: `cfdi_uuid` (UNIQUE nullable para facturas extranjeras PDF), `tipo_factura` (EMITIDA/RECIBIDA, n8n lo deriva por `rfc_emisor`), `formato_origen` (XML/PDF), montos en moneda original (MXN/USD/BRL/XXX), sin defaults de negocio, sin `updated_at`.
- **`public.movimientos_bancarios`** — estados de cuenta bancarios en MXN y USD. `monto` siempre positivo; `tipo_movimiento` (CARGO/ABONO) lleva el signo.
- **`public.conciliaciones`** — tabla puente muchos-a-muchos entre facturas y movimientos. `monto_aplicado` por línea; UNIQUE `(factura_id, movimiento_id)`.
- **`public.v_movimientos_bancarios`** — vista que calcula `estado_conciliacion` (pendiente/parcial/conciliada) y `monto_conciliado` al vuelo desde `conciliaciones`. No hay vista equivalente de facturas por ahora; se consulta `conciliaciones` directo.

Stack del proyecto: Vite + React + TypeScript + Supabase. Cliente en `src/lib/supabase.ts`. Dashboard actual lee un CSV (`concentrado.csv`) con Papaparse — aún no migrado a Supabase.

### Código n8n del branch XML — LISTO ✅ (falta pegarlo en n8n y conectar el insert)
El nodo Code que parsea CFDI XML quedó adaptado para emitir JSON con las claves exactas de `public.facturas`:

```javascript
const RFC_PROPIO = 'SIN1304305B9';

return $input.all().map(item => {
    const xmlStr = item.json.data;

    const attr = (tag, attrName) => {
        const re = new RegExp(`<[^>]*:?${tag}[^>]*\\s${attrName}="([^"]*)"`, 'i');
        const m = xmlStr.match(re);
        return m ? m[1] : '';
    };

    // '' -> null para que Postgres no truene castear UUID/DATE/NUMERIC vacíos
    const nn = v => v === '' ? null : v;
    const num = v => v === '' ? null : parseFloat(v);

    const conceptos = [...xmlStr.matchAll(/Descripcion="([^"]*)"/gi)]
        .map(m => m[1]).join(' | ');

    const rfcEmisor = attr('Emisor', 'Rfc').toUpperCase();

    return {
        json: {
            cfdi_uuid:      nn(attr('TimbreFiscalDigital', 'UUID').toLowerCase()),
            tipo_factura:   rfcEmisor === RFC_PROPIO ? 'EMITIDA' : 'RECIBIDA',
            tipo:           nn(attr('Comprobante', 'TipoDeComprobante')),
            formato_origen: 'XML',
            fecha:          nn(attr('Comprobante', 'Fecha').split('T')[0]),
            fecha_timbrado: nn(attr('TimbreFiscalDigital', 'FechaTimbrado').split('T')[0]),
            serie:          nn(attr('Comprobante', 'Serie')),
            folio:          nn(attr('Comprobante', 'Folio')),
            emisor:         nn(attr('Emisor', 'Nombre')),
            rfc_emisor:     nn(rfcEmisor),
            receptor:       nn(attr('Receptor', 'Nombre')),
            rfc_receptor:   nn(attr('Receptor', 'Rfc').toUpperCase()),
            uso_cfdi:       nn(attr('Receptor', 'UsoCFDI')),
            moneda:         nn(attr('Comprobante', 'Moneda')),
            subtotal:       num(attr('Comprobante', 'SubTotal')),
            total:          num(attr('Comprobante', 'Total')),
            forma_pago:     nn(attr('Comprobante', 'FormaPago') || attr('Pago', 'FormaDePagoP')),
            metodo_pago:    nn(attr('Comprobante', 'MetodoPago')),
            conceptos:      nn(conceptos),
        }
    };
});
```

Decisiones de este código:
- Vacíos (`''`) se convierten a `null` — `cfdi_uuid` es UUID y `fecha`/`fecha_timbrado` son DATE; un string vacío rompe el cast en Postgres.
- `subtotal`/`total` ausentes → `null`, no `0` (consistente con "sin defaults de negocio").
- RFCs normalizados a mayúsculas, UUID a minúsculas (por el UNIQUE y la comparación con `RFC_PROPIO`).
- `xmlRaw` eliminado: la tabla no tiene columna para el XML crudo (se descartó).
- `categoria` no se extrae: no existe en el XML; queda `null` y se llena después.

**Insert con idempotencia (nodo siguiente en n8n):** HTTP Request a PostgREST —
`POST {SUPABASE_URL}/rest/v1/facturas?on_conflict=cfdi_uuid` con headers `apikey`, `Authorization: Bearer <service_role>`, `Prefer: resolution=merge-duplicates`. El nodo nativo de Supabase en n8n no soporta upsert. Ojo: la RLS (`auth.role() = 'authenticated'`) bloquea la `anon key` — n8n necesita la `service_role` key.

### Contexto del pipeline actual (n8n)
- Las facturas suben desde `src/pages/Financiero/Facturas/index.tsx` → POST a `https://n8n.myinfo.la/webhook/oraculo/clasificador-facturas`.
- n8n tiene **dos branches**:
  - **XML**: procesamiento con código determinista (código de arriba).
  - **PDF**: procesamiento con AI agent (entidades extranjeras).
- Hasta ahora el output era Google Sheets. El siguiente paso es apuntar a Supabase.

---

## What Worked

- El diseño del modelo se derivó directamente del `Factura` interface ya definido en `src/pages/Financiero/Dashboard/utils.ts` — mapeo 1:1.
- Rol Developer de Supabase tiene acceso al SQL Editor; no se necesitó CLI ni credenciales de admin.
- Decisión de no almacenar `estado_conciliacion` en columna — calcularlo en vista — simplifica el modelo y evita inconsistencias.
- El parser regex determinista funciona bien contra CFDI 4.0 reales, incluidos tipo P (verificado contra un REP real de `~/Downloads/.tmp/emitidas/202605/`).

## What Didn't Work / Decisiones explícitas

- **Sin `DEFAULT` en `subtotal`, `total`, `formato_origen`**: los provee n8n, no la DB.
- **Sin `updated_at` ni triggers**: el usuario los descartó explícitamente — solo `created_at`.
- **Sin vista `v_facturas`**: descartada por ahora; el estado de conciliación de facturas se resuelve con queries directas a `conciliaciones`.
- **Sin normalización a MXN**: los montos se guardan en su moneda original. Los estados de cuenta vienen en USD y MXN.
- **Sin seed del histórico**: la tabla arranca vacía; n8n inserta lo nuevo.
- **CFDI tipo P (complementos de pago / REP) — detalle del complemento DESCARTADO a propósito.** Se analizó que los REP llegan con `total=0`, `moneda='XXX'` y que el detalle real (`pago20:Pago` con Monto/MonedaP/TipoCambioP/FechaPago, y `DoctoRelacionado` que vincula el pago a facturas concretas) se pierde con el parser actual. El usuario decidió explícitamente que **da igual que se pierda**: los REP se insertan tal cual (total 0) y la conciliación se hará solo contra movimientos bancarios. NO proponer de nuevo una tabla `pagos_cfdi` ni extraer `DoctoRelacionado` salvo que el usuario lo pida.
- **Sin columna `xml_raw`**: el XML crudo no se almacena.

---

## Next Steps

### 1. Conectar el branch XML de n8n a Supabase
- Pegar el código de arriba en el nodo Code del branch XML.
- Agregar el nodo HTTP Request de upsert a PostgREST (config arriba) con credencial `service_role`.
- Quitar/desactivar el nodo de Google Sheets de ese branch.
- Probar con XMLs reales (hay muestras en `~/Downloads/.tmp/emitidas/202605/`) y verificar idempotencia re-enviando el mismo XML.

### 2. Reemplazar el AI agent de PDF en n8n por Hermes (Nous Research)
El usuario ya tiene agentes Hermes implementados y funcionando. La idea es exponer el agente Hermes como un endpoint HTTP y que n8n lo llame en la branch de PDF en lugar del AI agent interno.

Pendiente discutir:
- ¿Exponer Hermes como endpoint REST propio o usar una capa intermedia (LangServe, FastAPI, etc.)?
- Contrato del endpoint: input (PDF en base64 o URL), output esperado (JSON con las mismas claves snake_case que el código del branch XML).
- Manejo de campos opcionales / ausentes en facturas extranjeras (sin `cfdi_uuid`, sin `rfc_emisor`, `formato_origen='PDF'`).
- Estrategia de fallback si el agente no puede extraer un campo.

### 3. (Siguiente entregable) Migrar el Dashboard de CSV a Supabase
- Reemplazar `parseCSV` + Papaparse en `src/pages/Financiero/Dashboard/utils.ts` por `supabase.from('facturas').select(...)`.
- Las funciones de agregación (`computeKPIs`, `monthlySeries`, `byCategoria`, `topProveedores`) pueden moverse a queries SQL o mantenerse en el cliente — a decidir.
