// Parser DETERMINISTA de estados de cuenta BBVA (export TSV) -> filas de
// `public.movimientos_bancarios`. Mismo modulo lo usan la Edge Function (Deno)
// y el script de re-ingesta (Node) -> cero drift, igual que _shared/cfdi.mjs.
//
// Formato del archivo (Latin-1, separado por TAB, una linea de header):
//   Día \t Concepto / Referencia \t cargo \t Abono \t Saldo
//   30-01-2026 \t DEPOSITO DE TERCERO/REF... \t \t 10,440.00 \t 105,515.40
//
// - cargo y Abono son mutuamente excluyentes (uno vacio).
// - cargo = egreso (CARGO), Abono = ingreso (ABONO).
// - Saldo es el saldo corriente DESPUES del movimiento.
// - La moneda y el banco salen del NOMBRE del archivo (no estan en el TXT).
// - El ORDENANTE (cuando existe) viene embebido en el concepto como texto.

// "10,440.00" -> 10440.00 ; "" / null -> null
function parseMonto(s) {
  if (s == null) return null;
  const limpio = String(s).replace(/,/g, "").trim();
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

// "30-01-2026" (DD-MM-YYYY) -> "2026-01-30" (ISO). null si no matchea.
function parseFecha(s) {
  const m = String(s ?? "").trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

// Colapsa espacios internos y recorta. Los TXT de BBVA traen padding largo.
function limpiar(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

// Deriva moneda + banco del nombre del archivo (ej. "202601-BBVA-MXN.txt").
function metaArchivo(fileName) {
  const name = String(fileName ?? "");
  const moneda = /usd/i.test(name) ? "USD" : /mxn/i.test(name) ? "MXN" : null;
  if (!moneda) {
    throw new Error(`No puedo derivar la moneda (MXN/USD) del nombre: ${name}`);
  }
  const banco = /bbva/i.test(name) ? "BBVA" : null;
  return { moneda, banco };
}

/**
 * Parsea el contenido de un estado de cuenta a filas de movimientos_bancarios.
 * @param {string} text     Contenido del TXT ya decodificado (Latin-1 -> string).
 * @param {string} fileName Nombre del archivo (define moneda y banco).
 * @returns {Array<object>} Filas listas para upsert.
 */
export function parseEdoCuenta(text, fileName) {
  const { moneda, banco } = metaArchivo(fileName);

  const lineas = String(text ?? "").split(/\r\n|\r|\n/);
  const rows = [];

  for (const raw of lineas) {
    if (raw.trim() === "") continue;
    const cols = raw.split("\t");
    if (cols.length < 5) continue; // linea malformada
    const [diaRaw, conceptoRaw, cargoRaw, abonoRaw, saldoRaw] = cols;

    const fecha = parseFecha(diaRaw);
    if (!fecha) continue; // header ("Día") y cualquier fila sin fecha valida

    const cargo = parseMonto(cargoRaw);
    const abono = parseMonto(abonoRaw);
    let tipo_movimiento, monto;
    if (cargo != null) {
      tipo_movimiento = "CARGO";
      monto = cargo;
    } else if (abono != null) {
      tipo_movimiento = "ABONO";
      monto = abono;
    } else {
      continue; // sin cargo ni abono: no es un movimiento
    }

    const concepto = limpiar(conceptoRaw);
    // El header de la columna es "Concepto / Referencia": el primer "/" separa
    // el tipo de operacion (descripcion) de la referencia.
    const slash = concepto.indexOf("/");
    const descripcion = slash >= 0 ? concepto.slice(0, slash).trim() : concepto;
    const referencia = slash >= 0 ? concepto.slice(slash + 1).trim() || null : null;

    const saldo = parseMonto(saldoRaw);

    // Clave determinista para upsert idempotente (no hay UUID en un edo. de cuenta).
    // El saldo corriente hace cada fila practicamente unica dentro de una cuenta;
    // incluir concepto completo evita colisiones en casos degenerados.
    const dedup_key = [
      moneda,
      fecha,
      tipo_movimiento,
      monto.toFixed(2),
      saldo == null ? "" : saldo.toFixed(2),
      concepto,
    ].join("|");

    rows.push({
      banco,
      cuenta: null,
      moneda,
      fecha,
      descripcion,
      referencia,
      tipo_movimiento,
      monto,
      saldo,
      archivo_origen: fileName,
      dedup_key,
    });
  }

  return rows;
}
