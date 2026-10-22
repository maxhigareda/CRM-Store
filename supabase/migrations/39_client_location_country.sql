-- ==============================================================================
-- MIGRACIÓN 39: Ubicación, Huso Horario y Calendario en Clientes del CRM
-- ==============================================================================

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS location_country VARCHAR(100) DEFAULT 'México',
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(10) DEFAULT 'MX',
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'GMT-6 (Hora Central)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_clients_location_country ON public.clients(location_country);
