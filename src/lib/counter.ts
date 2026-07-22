/**
 * Contador de tempo juntos.
 * Calcula a diferença entre a data inicial e agora em partes legíveis.
 */

export interface TimeTogether {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function timeTogether(startISO: string, now: Date = new Date()): TimeTogether | null {
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime()) || start.getTime() > now.getTime()) {
    return null;
  }

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  let hours = now.getHours() - start.getHours();
  let minutes = now.getMinutes() - start.getMinutes();
  let seconds = now.getSeconds() - start.getSeconds();

  if (seconds < 0) {
    seconds += 60;
    minutes -= 1;
  }
  if (minutes < 0) {
    minutes += 60;
    hours -= 1;
  }
  if (hours < 0) {
    hours += 24;
    days -= 1;
  }
  if (days < 0) {
    const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += daysInPrevMonth;
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }

  return { years, months, days, hours, minutes, seconds };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Ex.: "2 anos, 3 meses e 5 dias". */
export function formatTimeTogether(t: TimeTogether): string {
  const parts: string[] = [];
  if (t.years) parts.push(plural(t.years, "ano", "anos"));
  if (t.months) parts.push(plural(t.months, "mês", "meses"));
  if (t.days) parts.push(plural(t.days, "dia", "dias"));
  if (parts.length === 0) return "hoje começou essa história";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}
