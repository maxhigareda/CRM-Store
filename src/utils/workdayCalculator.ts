/**
 * Calcula la fecha fin hábil de un proyecto saltando fines de semana y festivos de la sede del cliente.
 * @param startDateStr Fecha de inicio 'YYYY-MM-DD'
 * @param durationInDays Cantidad de días hábiles cotizados
 * @param holidayDateStrings Arreglo de strings 'YYYY-MM-DD' con los festivos aplicables
 * @returns Fecha de fin 'YYYY-MM-DD'
 */
export function calculateWorkingEndDate(
  startDateStr: string,
  durationInDays: number,
  holidayDateStrings: string[] = []
): string {
  if (!startDateStr || isNaN(durationInDays) || durationInDays <= 0) {
    return '';
  }

  const holidaySet = new Set(holidayDateStrings);
  // Usar hora del mediodía para evitar problemas de desfase UTC
  const current = new Date(startDateStr + 'T12:00:00');
  let addedDays = 0;

  // Si el día inicial cae en fin de semana o festivo, no se cuenta como primer día de trabajo
  while (addedDays < durationInDays) {
    const dayOfWeek = current.getDay(); // 0 = Domingo, 6 = Sábado
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Formatear fecha local YYYY-MM-DD
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const dateFormatted = `${yyyy}-${mm}-${dd}`;
    
    const isHoliday = holidaySet.has(dateFormatted);

    if (!isWeekend && !isHoliday) {
      addedDays++;
      if (addedDays === durationInDays) {
        break;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  const finalYyyy = current.getFullYear();
  const finalMm = String(current.getMonth() + 1).padStart(2, '0');
  const finalDd = String(current.getDate()).padStart(2, '0');
  return `${finalYyyy}-${finalMm}-${finalDd}`;
}

/**
 * Convierte semanas hábiles a días hábiles (1 semana = 5 días hábiles estándar)
 */
export function weeksToWorkingDays(weeks: number): number {
  return Math.max(1, Math.round(weeks * 5));
}
