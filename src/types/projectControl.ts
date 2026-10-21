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

export interface TaskTimeLog {
  id?: string;
  task_id: string;
  profile_id: string;
  project_id: string;
  work_date: string;
  hours_logged: number;
  description?: string;
  hourly_rate_snapshot?: number;
  created_at?: string;
  updated_at?: string;
  profile?: {
    id: string;
    full_name: string;
    email: string;
  };
  task?: {
    id: string;
    title: string;
  };
}

export interface ResourceCapacity {
  profile_id: string;
  full_name: string;
  email: string;
  weekly_target_hours: number;
  monthly_target_hours: number;
  real_hourly_cost?: number;
  weekly_assigned_hours: number;
  weekly_logged_hours: number;
  occupancy_pct: number;
  is_overallocated: boolean;
  projects_breakdown: {
    project_id: string;
    project_name: string;
    hours: number;
  }[];
}

export interface ProjectRisk {
  id?: string;
  project_id: string;
  deliverable_id?: string;
  task_id?: string;
  title: string;
  description?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: 'low' | 'medium' | 'high';
  status: 'identified' | 'mitigated' | 'materialized' | 'resolved';
  mitigation_plan?: string;
  responsible_id?: string;
  materialized_impact_summary?: string;
  created_at?: string;
  responsible?: {
    id: string;
    full_name: string;
    email: string;
  };
  deliverable?: {
    id: string;
    name: string;
  };
}
