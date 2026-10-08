# Guía de Contexto y Arquitectura del Proyecto (CLAUDE.md)
*Este archivo proporciona todo el contexto técnico, arquitectura, reglas de negocio y convenciones para desarrolladores y agentes de IA (como Claude Code).*

---

## 1. Visión General del Proyecto

**Nombre del Proyecto:** CRM & ERP Store Intelligence (GeStore / Hazu)  
**Propósito:** Plataforma integral para la gestión empresarial de Store Intelligence, que centraliza:
1. **Gestión de Proyectos:** Tableros Kanban de entregables, planes de trabajo para colaboradores, minutas/juntas sincronizadas con Google Drive.
2. **Módulo Financiero:** Dashboard de ingresos y egresos, conciliación bancaria automática con CFDI 4.0 (XML y PDF), cuentas por cobrar (CxC) y catálogo de crédito.
3. **Módulo de Operaciones:** Monitoreo y trazabilidad de alta densidad en tiempo real para 50-70+ flujos automatizados en N8N por cliente.
4. **Módulo Comercial:** En etapa de planificación y desarrollo.

---

## 2. Stack Tecnológico

* **Frontend:** React 19, TypeScript, Vite, React Router DOM v7.
* **Componentes e Iconos:** Lucide React (`lucide-react`), DnD Kit (`@dnd-kit/core`, `@dnd-kit/sortable`).
* **Gráficas y Visualización:** Chart.js (`chart.js`, `react-chartjs-2`), Recharts (`recharts`).
* **Procesamiento de Archivos:** `fast-xml-parser` (CFDI XML SAT), `pdfjs-dist` (Facturas PDF).
* **Backend y Base de Datos:** Supabase (PostgreSQL), Supabase Auth, Row Level Security (RLS), Supabase Storage.
* **Automatización Externa:** N8N (Webhooks HTTP Request reportando a la tabla `flow_executions`).
* **Integración Cloud:** Google Drive API v3 (OAuth 2.0 con Google Identity Services y soporte para Shared Drives).
* **Despliegue / CI-CD:** Vercel conectado automáticamente a la rama `main` de GitHub (`maxhigareda/CRM-Store`).

---

## 3. Comandos de Desarrollo

```bash
# Iniciar servidor de desarrollo local
npm run dev

# Compilar proyecto y verificar TypeScript
npm run build

# Ejecutar linter
npm run lint

# Previsualizar build de producción
npm run preview
```

---

## 4. Variables de Entorno (`.env`)

El archivo `.env` en la raíz del proyecto contiene las credenciales de conexión con Supabase:

```env
VITE_SUPABASE_URL=https://zzrnpuefuxvnhkipjxqn.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6cm5wdWVmdXh2bmhraXBqeHFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ2NzQsImV4cCI6MjA5MjU1MDY3NH0.0p9l8Fl0iTdL7pxxLFtGEo5HtZXruCnkhQktqTjgghQ
```

---

## 5. Estructura de Directorios

```text
├── src/
│   ├── components/            # Componentes reutilizables de UI y Layouts
│   │   ├── Layout/            # Layout principal para el Módulo de Proyectos
│   │   ├── OperacionesLayout/ # Layout independiente para el Módulo de Operaciones
│   │   ├── Modals/            # Modales de confirmación, prompt y formularios
│   │   └── Sidebar/           # Barras laterales de navegación
│   ├── contexts/              # Contextos de React
│   │   ├── AuthContext.tsx    # Sesión, usuario activo, roles y módulos permitidos
│   │   └── NotificationContext.tsx # Sistema global de notificaciones toast
│   ├── lib/
│   │   └── supabase.ts        # Cliente Supabase inicializado
│   ├── pages/                 # Páginas organizadas por módulo
│   │   ├── Home/              # Portal de bienvenida y selector de módulos
│   │   ├── Login/             # Inicio de sesión
│   │   ├── ResetPassword/     # Restablecimiento de contraseña
│   │   ├── Admin/             # Gestión de usuarios, asignación de áreas y módulos
│   │   ├── Clients/           # Catálogo de clientes y empresas
│   │   ├── Collaborators/     # Gestión de colaboradores y cargas
│   │   ├── Board/             # Tablero Kanban de proyectos
│   │   ├── PlanTrabajo/       # Vista de tareas y entregables por colaborador
│   │   ├── LeadTeamMeetings/  # Minutas de juntas y sincronización Google Drive
│   │   ├── Tags/              # Catálogo de etiquetas
│   │   ├── Operaciones/       # MÓDULO OPERACIONES
│   │   │   └── Flujos/        # Monitor de alta densidad de flujos N8N
│   │   └── Financiero/        # MÓDULO FINANCIERO
│   │       ├── Dashboard/     # Gráficas de ingresos, egresos y balances
│   │       ├── Conciliacion/  # Conciliación bancaria contra facturas
│   │       ├── CuentasPorCobrar/ # Seguimiento de cobranza y días de crédito
│   │       ├── Tablas/        # Tablas de Facturas y Movimientos Bancarios
│   │       └── components/    # Visores y formularios de facturación
│   ├── App.tsx                # Configuración de rutas (React Router)
│   └── main.tsx               # Punto de entrada de la aplicación
├── supabase/
│   └── migrations/            # 34 migraciones SQL ordenadas cronológicamente
└── package.json
```

---

## 6. Reglas de Negocio y Convenciones Críticas

### A. Clientes (`clients`)
* **`clients.reference_name`**: Nombre de la **Empresa / Razón Social** (ej. *"Liverpool"*, *"Kraft"*). Es el nombre comercial que **siempre debe mostrarse en la UI**.
* **`clients.name`**: Nombre del contacto personal dentro de la empresa.
* **Convención en código:** Nunca mostrar solo `client.name`. Siempre usar el helper:
  ```typescript
  export const getClientDisplayName = (client?: { name?: string; reference_name?: string } | null) => {
    if (!client) return 'Cliente';
    return client.reference_name || client.name || 'Cliente';
  };
  ```

### B. Perfiles y Permisos (`profiles`)
* **`profiles.role`**: `'admin' | 'collaborator'`.
  * Los administradores tienen acceso a todo el sistema y a la pantalla de `/admin`.
  * Los colaboradores solo ven sus tareas en el *Plan de Trabajo*.
* **`profiles.modules`**: Arreglo de strings con los módulos asignados: `['comercial', 'financiero', 'proyectos', 'operaciones']`.
* **`profiles.can_edit_facturas`**: Booleano que define si el usuario puede modificar y reclasificar facturas en el módulo financiero (sin este permiso, la vista es de solo lectura).
* **Redirección en Home:** Si un usuario tiene **un solo módulo asignado**, el `Home` lo redirige automáticamente a su módulo correspondiente.

### C. Políticas RLS en Supabase
* Al crear o modificar tablas que reciban operaciones `INSERT` desde el cliente o desde webhooks anónimos de N8N, **la política RLS debe incluir `WITH CHECK (true)`**:
  ```sql
  CREATE POLICY "Manage operation flows" ON public.operation_flows
      FOR ALL
      USING (true)
      WITH CHECK (true);
  ```
  *(Omitir `WITH CHECK` genera el error: `new row violates row-level security policy`).*

### D. Manejo de Fechas y Zonas Horarias
* N8N y la base de datos almacenan timestamps en formato UTC ISO (ej. `2026-08-26T04:34:18Z`).
* Para evitar desfases de día (ej. que una ejecución de las 10:34 PM en México aparezca como del día siguiente por culpa de UTC), **las comparaciones de fecha en el frontend siempre se hacen convirtiendo a la hora local del navegador**:
  ```typescript
  export const getLocalDateStr = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  export const getExecLocalDateStr = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return getLocalDateStr(d);
  };
  ```

---

## 7. Módulos y Flujos de Trabajo Clave

### 1. Monitor de Operaciones (Flujos N8N) — `src/pages/Operaciones/Flujos`
* **Propósito:** Monitorear diariamente entre 50 y 70 flujos de N8N agrupados y filtrados por cliente.
* **Layout:** Tabla semántica compacta de alta densidad con:
  * Filtro de fecha por defecto en **"Hoy"**, con botones rápidos (*Hoy*, *Ayer*, *Histórico Completo*, *Datepicker*).
  * KPIs acotados dinámicamente al filtro activo.
  * Acordeón desplegable por fila con Stepper visual de 3 círculos:
    * `1. En Cola` ➔ `2. En Proceso` (con spinner) ➔ `3. Terminado / Error`.
  * Caja de log de error multilínea en monospace con botón de copiado para fallos como timeouts (`Network.enable timed out...`).
  * Modal de Bitácora lateral para inspeccionar historial y payloads JSON (`payload_input` / `payload_output`).

#### Protocolo Webhook para N8N:
* **Endpoint Supabase:** `POST https://zzrnpuefuxvnhkipjxqn.supabase.co/rest/v1/flow_executions`
* **Headers requeridos en N8N:**
  * `apikey`: `<VITE_SUPABASE_ANON_KEY>`
  * `Authorization`: `Bearer <VITE_SUPABASE_ANON_KEY>`
  * `Content-Type`: `application/json`
* **Sintaxis de Fecha en N8N:** N8N utiliza Luxon para `$now`, por lo que se debe usar `={{ $now.toISO() }}` (no `.toISOString()`).

**Body JSON en N8N para Reportar Errores:**
```json
{
  "flow_id": "ID_DEL_FLUJO",
  "client_id": "ID_DEL_CLIENTE",
  "execution_id": "={{ $execution.id }}",
  "status": "error",
  "error_log": "={{ $json.error?.message || $json.message || $json.error || $execution.error?.message || (typeof $json === 'string' ? $json : JSON.stringify($json)) }}",
  "payload_output": "={{ $json }}",
  "finished_at": "={{ $now.toISO() }}"
}
```

---

### 2. Juntas Lead Team y Google Drive — `src/pages/LeadTeamMeetings`
* **Propósito:** Registrar juntas ejecutivas y sincronizar automáticamente grabaciones y minutas alojadas en Google Drive.
* **Autenticación:** Google OAuth 2.0 vía Google Identity Services (`google.accounts.oauth2.initTokenClient`).
* **Soporte Google Workspace:** Las consultas a la API de Drive incluyen `supportsAllDrives=true` e `includeItemsFromAllDrives=true` para permitir lectura en Shared Drives corporativos.

---

### 3. Módulo Financiero — `src/pages/Financiero`
* **Conciliación:** Cruza los movimientos bancarios (`movimientos_bancarios`) con facturas SAT (`facturas`) calculando diferencias de centavos, estado de pago y fechas de vencimiento.
* **Cuentas por Cobrar (CxC):** Calcula días de crédito vencidos según el catálogo `catalogo_dias_credito`.
* **Procesamiento CFDI 4.0:** Soporta carga masiva de XMLs (parseados con `fast-xml-parser`) y extracción de PDFs asociados.

---

## 8. Resumen de Tablas en Base de Datos (Supabase)

| Tabla | Descripción |
| :--- | :--- |
| `profiles` | Perfiles de usuario vinculados a `auth.users`, roles (`admin`/`collaborator`), áreas y módulos asignados. |
| `areas` | Catálogo de áreas de la empresa (Operaciones, Diseño, Marketing, etc.). |
| `clients` | Empresas y clientes del CRM (`reference_name` para empresa, `name` para contacto). |
| `projects` | Proyectos asignados a clientes con fechas, fases y prioridades. |
| `tasks` | Tareas y entregables del tablero Kanban y planes de trabajo. |
| `tags` / `task_tags` | Etiquetas clasificadoras por tipo. |
| `lead_team_meetings` | Juntas semanales del Lead Team con enlace a Google Drive. |
| `lead_team_tasks` | Compromisos y tareas derivadas de las juntas. |
| `facturas` | Facturas emitidas/recibidas con metadatos de CFDI 4.0, UUID SAT, emisor, receptor, impuestos y montos. |
| `movimientos_bancarios` | Estado de cuenta bancario para conciliación. |
| `catalogo_dias_credito` | Días de crédito configurados por cliente o tipo de servicio. |
| `operation_flows` | Catálogo de flujos automatizados de operaciones por cliente. |
| `flow_executions` | Historial y bitácora en tiempo real de ejecuciones de N8N con estado, pasos, payloads y errores. |

---

## 9. Instrucciones para Despliegue

Cualquier cambio empujado a la rama `main` en GitHub dispara automáticamente un nuevo build en Vercel:
```bash
git add .
git commit -m "feat: descripcion del cambio"
git push origin main
```
*Nota: Si el navegador retiene la versión previa en caché, solicitar un hard reload (`Cmd + Shift + R` en Mac / `Ctrl + Shift + R` en Windows).*
