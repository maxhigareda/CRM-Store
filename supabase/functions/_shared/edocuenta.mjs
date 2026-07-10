// Parser DETERMINISTA de estados de cuenta BBVA (PDF oficial) -> filas de
// `public.movimientos_bancarios`. Mismo modulo lo usan la Edge Function (Deno),
// el frontend (browser) y el script de re-ingesta (Node) -> cero drift.
//
// El PDF es la fuente ORIGINAL sin modificar. La extraccion de texto (bytes ->
// items con coordenadas) la hace cada entorno con pdfjs; este modulo NO importa
// pdfjs: recibe los items ya extraidos y aplica la logica de negocio.
//
// Layout del "Detalle de Movimientos Realizados" (una fila por transaccion):
//   FECHA(OPER LIQ)  COD  DESCRIPCION  REFERENCIA  CARGOS  ABONOS  SALDO(OPER LIQ)
//   01/JUN 01/JUN  T31 DISPERSION        447,660.24  739,557.50 739,557.50
//    20000965112026 Ref. DISPERSION   <- lineas de referencia (multi-linea)
//
// Claves del parseo:
// - Cada monto es un item con coordenada X. "Cargos" y "Abonos" son columnas
//   distintas por POSICION; el texto plano las confunde, asi que clasificamos
//   por el borde derecho del numero contra la X de las etiquetas del header
//   (que se repiten en cada pagina, permitiendo autocalibrar).
// - El SALDO solo aparece en el ultimo movimiento de cada dia (columnas OPER y
//   LIQ, iguales); guardamos el saldo de LIQUIDACION.
// - Moneda, No. de cuenta y periodo (año) salen del texto de la pagina 1.

const MESES = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
};

const numRe = /^-?[\d,]+\.\d{2}$/;      // "447,660.24"
const dateRe = /^(\d{2})\/([A-Z]{3})$/; // "01/JUN"
const codRe = /^[A-Z][0-9A-Z]{2}$/;     // "T31", "C19", "H09"

// "447,660.24" -> 447660.24
function parseMonto(s) {
  return Number(String(s).replace(/,/g, ""));
}

/**
 * Mapea el resultado de pdfjs `page.getTextContent()` a nuestra forma de item.
 * Puro (no usa pdfjs); lo llaman el browser y Node con identico resultado.
 * @param {{items: Array<{str:string, width:number, transform:number[]}>}} tc
 * @returns {Array<{x:number, y:number, right:number, s:string}>}
 */
export function itemsFromTextContent(tc) {
  const out = [];
  for (const it of tc.items ?? []) {
    const s = String(it.str ?? "").trim();
    if (!s) continue;
    const x = it.transform[4];
    out.push({ x, y: it.transform[5], right: x + it.width, s });
  }
  return out;
}

// Deriva moneda, cuenta y año del periodo desde el texto de la pagina 1.
function metaDocumento(pages, fileName) {
  const text = (pages[0] ?? []).map((i) => i.s).join(" ");

  const per = text.match(/Periodo DEL\s+\d{2}\/\d{2}\/\d{4}\s+AL\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  const periodMonth = per ? Number(per[2]) : null;
  const periodYear = per ? Number(per[3]) : null;
  if (!periodYear) {
    throw new Error(`No puedo derivar el periodo (año) del PDF: ${fileName}`);
  }

  const moneda = /MONEDA\s+DOLARES/i.test(text) ? "USD"
    : /MONEDA\s+NACIONAL/i.test(text) ? "MXN"
    : /usd/i.test(fileName) ? "USD"
    : /mxn/i.test(fileName) ? "MXN"
    : null;
  if (!moneda) {
    throw new Error(`No puedo derivar la moneda (MXN/USD) del PDF: ${fileName}`);
  }

  const cta = text.match(/No\.\s*de\s*Cuenta\s+(\d+)/i);
  const cuenta = cta ? cta[1] : null;

  return { periodMonth, periodYear, moneda, cuenta };
}

// Agrupa items en filas visuales por su coordenada Y (con tolerancia).
function agruparEnFilas(items) {
  const rows = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    let r = rows.find((r) => Math.abs(r.y - it.y) < 2.5);
    if (!r) { r = { y: it.y, items: [] }; rows.push(r); }
    r.items.push(it);
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

// "01/JUN" + periodo -> "2026-06-01" (ISO). Los movimientos caen dentro del mes
// del periodo; solo ajustamos año en el borde Dic/Ene por robustez.
function fechaISO(diaMes, meta) {
  const m = diaMes.match(dateRe);
  const mes = MESES[m[2]];
  let year = meta.periodYear;
  if (mes !== meta.periodMonth && mes === 12 && meta.periodMonth === 1) {
    year = meta.periodYear - 1;
  }
  return `${year}-${String(mes).padStart(2, "0")}-${m[1]}`;
}

/**
 * Parsea un estado de cuenta BBVA (PDF) a filas de movimientos_bancarios.
 * @param {Array<Array<{x,y,right,s}>>} pages  Items por pagina (itemsFromTextContent).
 * @param {string} fileName  Nombre del archivo (solo para trazabilidad/errores).
 * @returns {Array<object>} Filas listas para upsert (con dedup_key).
 */
export function parseEdoCuenta(pages, fileName) {
  const meta = metaDocumento(pages, fileName);
  const rows = [];

  for (const items of pages) {
    // El header del detalle se repite en cada pagina; nos da los limites de columna.
    const hdrCargos = items.find((i) => i.s === "CARGOS");
    if (!hdrCargos) continue; // pagina sin tabla de movimientos
    const abonosX = items.find((i) => i.s === "ABONOS")?.x;
    const operX = items.find((i) => i.s.startsWith("OPERACI"))?.x;
    const liqX = items.find((i) => i.s.startsWith("LIQUIDACI"))?.x;
    if (abonosX == null || operX == null || liqX == null) continue;

    const filas = agruparEnFilas(items).filter((r) => r.y < hdrCargos.y - 3);

    let cur = null;
    const flush = () => { if (cur) rows.push(finalizar(cur, meta, fileName)); };

    for (const r of filas) {
      const first = r.items[0];
      const esInicio = first && first.x < 20 && dateRe.test(first.s);

      if (esInicio) {
        flush();

        // 2do item: "<fechaLiq> <COD> <descripcion...>"
        const second = r.items.find((i) => i.x > 20 && i.x < 90 && !numRe.test(i.s));
        let descripcion = "";
        if (second) {
          const toks = second.s.split(/\s+/);
          let idx = dateRe.test(toks[0]) ? 1 : 0;
          if (codRe.test(toks[idx])) idx++; // saltar el codigo de operacion
          descripcion = toks.slice(idx).join(" ");
        }

        // Montos en esta fila, clasificados por columna (borde derecho vs header).
        let tipo = null, monto = null, saldo = null;
        for (const it of r.items) {
          if (!numRe.test(it.s)) continue;
          const v = parseMonto(it.s);
          if (it.right < abonosX) { tipo = "CARGO"; monto = v; }
          else if (it.right < operX) { tipo = "ABONO"; monto = v; }
          else if (it.right < liqX) { /* saldo de operacion: se ignora */ }
          else { saldo = v; } // saldo de liquidacion
        }

        cur = {
          moneda: meta.moneda,
          cuenta: meta.cuenta,
          fecha: fechaISO(first.s, meta),
          descripcion,
          referencia: "",
          tipo,
          monto,
          saldo,
        };
      } else if (cur) {
        // Lineas de referencia (ordenante, tracking, "Ref. XXXX"): se acumulan.
        const txt = r.items.filter((i) => !numRe.test(i.s)).map((i) => i.s).join(" ").trim();
        if (txt) cur.referencia = cur.referencia ? `${cur.referencia} ${txt}` : txt;
      }
    }
    flush();
  }

  return rows.filter((r) => r.tipo_movimiento && r.monto != null);
}

// Convierte el acumulador en la fila final con dedup_key determinista.
function finalizar(cur, meta, fileName) {
  // Sin UUID en un estado de cuenta: clave determinista para upsert idempotente.
  // Incluye referencia + descripcion porque un mismo dia puede repetir monto/tipo
  // (ej. varias "IVA TRANSF RECEPCION INT 4.80" que solo difieren en la referencia).
  const dedup_key = [
    cur.cuenta ?? "",
    cur.moneda,
    cur.fecha,
    cur.tipo,
    cur.monto == null ? "" : cur.monto.toFixed(2),
    cur.descripcion,
    cur.referencia,
  ].join("|");

  return {
    banco: "BBVA",
    cuenta: cur.cuenta,
    moneda: cur.moneda,
    fecha: cur.fecha,
    descripcion: cur.descripcion,
    referencia: cur.referencia || null,
    tipo_movimiento: cur.tipo,
    monto: cur.monto,
    saldo: cur.saldo,
    archivo_origen: fileName,
    dedup_key,
  };
}
