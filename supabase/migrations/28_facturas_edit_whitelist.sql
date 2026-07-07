-- ──────────────────────────────────────────────
-- Whitelist de edición de facturas
--
-- Tener acceso al módulo Financiero = VER facturas (lectura). Para EDITAR,
-- ELIMINAR o CLASIFICAR EN MASA una factura el usuario debe estar en la
-- whitelist: profiles.can_edit_facturas = true. Subir XML/PDF (insert) queda
-- abierto a cualquier autenticado (el XML entra por Edge Function con service
-- role; el PDF hace insert con la sesión del usuario).
--
-- Sin default (NULL = no puede editar), siguiendo la convención del esquema.
-- ──────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_edit_facturas boolean;

-- Reemplaza la policy FOR ALL por un split lectura/escritura.
DROP POLICY IF EXISTS "Facturas manejables por autenticados" ON public.facturas;

-- Lectura: cualquier autenticado (el acceso al módulo se controla en la app).
CREATE POLICY "Facturas lectura autenticados" ON public.facturas
    FOR SELECT USING (auth.role() = 'authenticated');

-- Alta (subir XML/PDF): cualquier autenticado.
CREATE POLICY "Facturas insert autenticados" ON public.facturas
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Edición manual y clasificación en masa (ambas son UPDATE): solo whitelist.
CREATE POLICY "Facturas update whitelist" ON public.facturas
    FOR UPDATE
    USING ((SELECT can_edit_facturas FROM public.profiles WHERE id = auth.uid()) IS TRUE)
    WITH CHECK ((SELECT can_edit_facturas FROM public.profiles WHERE id = auth.uid()) IS TRUE);

-- Borrado físico: solo whitelist.
CREATE POLICY "Facturas delete whitelist" ON public.facturas
    FOR DELETE
    USING ((SELECT can_edit_facturas FROM public.profiles WHERE id = auth.uid()) IS TRUE);

-- ──────────────────────────────────────────────
-- Endurecer la auto-edición de perfil (cierra escalada de privilegios)
--
-- La policy "Users can update own profile" permite que un usuario actualice su
-- propia fila sin restringir columnas. Sin esto, cualquiera podría auto-asignarse
-- role='admin', modules o can_edit_facturas por la API y saltarse la whitelist.
-- Un trigger impide que un NO-admin cambie columnas privilegiadas.
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Contextos de backend confiables (service role, editor SQL, migraciones) no
  -- tienen auth.uid(): se permiten. La escalada de privilegios solo importa para
  -- usuarios autenticados desde la app.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Los admins pueden cambiar lo que sea (incluye a otros usuarios).
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Un no-admin no puede escalar privilegios: las columnas sensibles deben
  -- quedar idénticas a su valor previo.
  IF NEW.role             IS DISTINCT FROM OLD.role
     OR NEW.modules           IS DISTINCT FROM OLD.modules
     OR NEW.can_edit_facturas IS DISTINCT FROM OLD.can_edit_facturas THEN
    RAISE EXCEPTION 'No autorizado para modificar columnas privilegiadas del perfil';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_privileged_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_privileged_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privileged_profile_columns();
