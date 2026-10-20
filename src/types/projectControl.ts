export interface ProjectPO {
  id?: string;
  project_id?: string;
  po_number: string;
  po_amount: number;
  currency: string;
  document_url?: string;
  is_mismatch_with_quote: boolean;
  mismatch_justification?: string;
  created_at?: string;
}

export interface CostRateItem {
  id: string;
  role_name: string;
  seniority: string;
  hourly_rate_estimated: number;
  currency: string;
}

export interface CommittedResource {
  role_id: string;
  role_name: string;
  hours: number;
  rate: number;
}

export interface LocationHoliday {
  id: string;
  client_id: string;
  holiday_date: string;
  holiday_name: string;
}

export interface Deliverable {
  id?: string;
  project_id?: string;
  name: string;
  description?: string;
  weight_pct: number;
  status: 'pending' | 'in_progress' | 'review' | 'accepted';
  acceptance_criteria?: string;
  acceptance_proof_url?: string;
  baseline_start_date?: string;
  baseline_end_date?: string;
  current_end_date?: string;
}

export interface PaymentMilestone {
  id?: string;
  project_id?: string;
  po_id?: string;
  deliverable_id?: string;
  name: string;
  percentage: number;
  amount: number;
  trigger_condition: 'contra_entrega' | 'anticipo' | 'fecha_fija';
  estimated_invoice_date?: string;
  status: 'pending' | 'ready_to_bill' | 'invoiced' | 'paid' | 'overdue';
  factura_id?: number;
  sat_uuid?: string;
}
