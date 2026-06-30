// Parser CFDI 4.0 -> fila de `public.facturas` (1 fila = 1 XML).
// Modulo compartido: lo usan tanto la Edge Function (Deno) como scripts/reingest.mjs (Node).
// Import "fast-xml-parser" resuelto via deno.json (Deno) o node_modules (Node).

import { XMLParser } from "fast-xml-parser";

const RFC_PROPIO = "SIN1304305B9";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,   // cfdi:Comprobante -> Comprobante, pago20:Pago -> Pago, etc.
  parseAttributeValue: false,
  trimValues: true,
});

// ── helpers ──────────────────────────────────────────────
const toArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const num = (x) => (x == null || x === "" ? null : Number(x));
const dateOnly = (s) => (s ? String(s).split("T")[0] : null);
const orNull = (x) => (x === undefined ? null : x);

// Busca una llave de complemento (Pagos, Nomina, TimbreFiscalDigital) tolerando
// que Complemento sea objeto o arreglo.
function fromComplemento(comprobante, key) {
  for (const c of toArray(comprobante.Complemento)) {
    if (c && c[key] != null) return c[key];
  }
  return null;
}

// ── mapeos de complementos ───────────────────────────────
function mapImpuestos(imp) {
  if (!imp) return null;
  const out = [];
  for (const t of toArray(imp.Traslados?.Traslado)) {
    out.push({
      tipo: "TRASLADO",
      base: num(t.Base),
      impuesto: orNull(t.Impuesto),
      tipo_factor: orNull(t.TipoFactor),
      tasa_o_cuota: num(t.TasaOCuota),
      importe: num(t.Importe),
    });
  }
  for (const r of toArray(imp.Retenciones?.Retencion)) {
    out.push({
      tipo: "RETENCION",
      base: num(r.Base),
      impuesto: orNull(r.Impuesto),
      tipo_factor: orNull(r.TipoFactor),
      tasa_o_cuota: num(r.TasaOCuota),
      importe: num(r.Importe),
    });
  }
  return out.length ? out : null;
}

function mapComplementoPago(pagos) {
  if (!pagos) return null;
  const tot = pagos.Totales ?? {};
  const out = {
    version: orNull(pagos.Version),
    totales: {
      monto_total_pagos: num(tot.MontoTotalPagos),
      total_trasladados_base_iva16: num(tot.TotalTrasladosBaseIVA16),
      total_trasladados_impuesto_iva16: num(tot.TotalTrasladosImpuestoIVA16),
    },
    pagos: toArray(pagos.Pago).map((p) => ({
      fecha_pago: orNull(p.FechaPago),
      forma_de_pago_p: orNull(p.FormaDePagoP),
      moneda_p: orNull(p.MonedaP),
      tipo_cambio_p: num(p.TipoCambioP),
      monto: num(p.Monto),
      num_operacion: orNull(p.NumOperacion),
      rfc_emisor_cta_ord: orNull(p.RfcEmisorCtaOrd),
      cta_ordenante: orNull(p.CtaOrdenante),
      rfc_emisor_cta_ben: orNull(p.RfcEmisorCtaBen),
      cta_beneficiario: orNull(p.CtaBeneficiario),
      docs_relacionados: toArray(p.DoctoRelacionado).map((d) => ({
        id_documento: d.IdDocumento ? String(d.IdDocumento).toUpperCase() : null,
        serie: orNull(d.Serie),
        folio: orNull(d.Folio),
        moneda_dr: orNull(d.MonedaDR),
        equivalencia_dr: num(d.EquivalenciaDR),
        num_parcialidad: num(d.NumParcialidad),
        imp_saldo_ant: num(d.ImpSaldoAnt),
        imp_pagado: num(d.ImpPagado),
        imp_saldo_insoluto: num(d.ImpSaldoInsoluto),
        objeto_imp_dr: orNull(d.ObjetoImpDR),
      })),
    })),
  };
  return out;
}

function mapNomina(nom) {
  if (!nom) return null;
  const rcv = nom.Receptor ?? {};
  const emi = nom.Emisor ?? {};
  return {
    tipo_nomina: orNull(nom.TipoNomina),
    fecha_pago: orNull(nom.FechaPago),
    fecha_inicial_pago: orNull(nom.FechaInicialPago),
    fecha_final_pago: orNull(nom.FechaFinalPago),
    num_dias_pagados: num(nom.NumDiasPagados),
    total_percepciones: num(nom.TotalPercepciones),
    total_deducciones: num(nom.TotalDeducciones),
    total_otros_pagos: num(nom.TotalOtrosPagos),
    registro_patronal: orNull(emi.RegistroPatronal),
    empleado: {
      curp: orNull(rcv.Curp),
      num_empleado: orNull(rcv.NumEmpleado),
      departamento: orNull(rcv.Departamento),
      puesto: orNull(rcv.Puesto),
      tipo_contrato: orNull(rcv.TipoContrato),
      tipo_regimen: orNull(rcv.TipoRegimen),
      periodicidad_pago: orNull(rcv.PeriodicidadPago),
      salario_diario_integrado: num(rcv.SalarioDiarioIntegrado),
      clave_ent_fed: orNull(rcv.ClaveEntFed),
    },
    percepciones: toArray(nom.Percepciones?.Percepcion).map((x) => ({
      tipo_percepcion: orNull(x.TipoPercepcion),
      clave: orNull(x.Clave),
      concepto: orNull(x.Concepto),
      importe_gravado: num(x.ImporteGravado),
      importe_exento: num(x.ImporteExento),
    })),
    deducciones: toArray(nom.Deducciones?.Deduccion).map((x) => ({
      tipo_deduccion: orNull(x.TipoDeduccion),
      clave: orNull(x.Clave),
      concepto: orNull(x.Concepto),
      importe: num(x.Importe),
    })),
    otros_pagos: toArray(nom.OtrosPagos?.OtroPago).map((x) => ({
      tipo_otro_pago: orNull(x.TipoOtroPago),
      clave: orNull(x.Clave),
      concepto: orNull(x.Concepto),
      importe: num(x.Importe),
      subsidio_causado: num(x.SubsidioAlEmpleo?.SubsidioCausado),
    })),
  };
}

function mapCfdiRelacionados(comprobante) {
  const grupos = toArray(comprobante.CfdiRelacionados);
  if (!grupos.length) return null;
  return grupos.map((g) => ({
    tipo_relacion: orNull(g.TipoRelacion),
    uuids: toArray(g.CfdiRelacionado)
      .map((r) => (r.UUID ? String(r.UUID).toUpperCase() : null))
      .filter(Boolean),
  }));
}

// ── parser principal ─────────────────────────────────────
// Devuelve la fila lista para upsert en `facturas`. Lanza si el XML no es un CFDI.
export function parseCfdiXml(xml, fileName) {
  const root = parser.parse(xml);
  const c = root.Comprobante;
  if (!c) throw new Error("No es un CFDI (falta Comprobante)");

  const emisor = c.Emisor ?? {};
  const receptor = c.Receptor ?? {};
  const tfd = fromComplemento(c, "TimbreFiscalDigital") ?? {};
  const pagos = fromComplemento(c, "Pagos");
  const nomina = fromComplemento(c, "Nomina");

  const rfcEmisor = emisor.Rfc ? String(emisor.Rfc).toUpperCase() : null;
  const conceptos = toArray(c.Conceptos?.Concepto)
    .map((x) => x.Descripcion)
    .filter(Boolean)
    .join(" | ");

  return {
    cfdi_uuid: tfd.UUID ? String(tfd.UUID).toUpperCase() : null,
    tipo_factura: rfcEmisor === RFC_PROPIO ? "EMITIDA" : "RECIBIDA",
    tipo: orNull(c.TipoDeComprobante),
    formato_origen: "XML",
    version: orNull(c.Version),

    fecha: dateOnly(c.Fecha),
    fecha_timbrado: dateOnly(tfd.FechaTimbrado),
    serie: orNull(c.Serie),
    folio: c.Folio != null ? String(c.Folio) : null,

    emisor: orNull(emisor.Nombre),
    rfc_emisor: rfcEmisor,
    regimen_fiscal_emisor: orNull(emisor.RegimenFiscal),
    receptor: orNull(receptor.Nombre),
    rfc_receptor: receptor.Rfc ? String(receptor.Rfc).toUpperCase() : null,
    regimen_fiscal_receptor: orNull(receptor.RegimenFiscalReceptor),
    domicilio_fiscal_receptor: orNull(receptor.DomicilioFiscalReceptor),

    uso_cfdi: orNull(receptor.UsoCFDI),
    moneda: orNull(c.Moneda),
    tipo_cambio: num(c.TipoCambio),
    subtotal: num(c.SubTotal),
    descuento: num(c.Descuento),
    total: num(c.Total),
    forma_pago: orNull(c.FormaPago),
    metodo_pago: orNull(c.MetodoPago),
    condiciones_pago: orNull(c.CondicionesDePago),
    exportacion: orNull(c.Exportacion),
    lugar_expedicion: c.LugarExpedicion != null ? String(c.LugarExpedicion) : null,

    total_impuestos_trasladados: num(c.Impuestos?.TotalImpuestosTrasladados),
    total_impuestos_retenidos: num(c.Impuestos?.TotalImpuestosRetenidos),
    impuestos: mapImpuestos(c.Impuestos),

    complemento_pago: mapComplementoPago(pagos),
    nomina: mapNomina(nomina),
    cfdi_relacionados: mapCfdiRelacionados(c),

    conceptos: conceptos || null,
    categoria: null,
    archivo_origen: fileName ?? null,
  };
}
