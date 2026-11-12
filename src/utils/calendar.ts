import { CommunityEvent } from '../types';

/**
 * Generates an iCalendar (.ics) RFC 5545 string and prompts file download
 */
export function exportEventToIcs(event: CommunityEvent): void {
  // Parse event date and time
  const [year, month, day] = event.date.split('-').map(Number);
  const [hours, minutes] = event.time.split(':').map(Number);

  const startDate = new Date(year, month - 1, day, hours, minutes);
  const endDate = new Date(startDate.getTime() + (event.durationMinutes || 90) * 60 * 1000);

  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const nowFormatted = formatDate(new Date());
  const startFormatted = formatDate(startDate);
  const endFormatted = formatDate(endDate);

  const materialsText = event.requiredMaterials && event.requiredMaterials.length > 0
    ? `\\n\\nНеобходимые материалы:\\n- ${event.requiredMaterials.join('\\n- ')}`
    : '';

  const cleanDescription = (event.description + materialsText)
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shanyraq Hub//Community Events//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:shanyraq-${event.id}-${Date.now()}@shanyraqhub.kz`,
    `DTSTAMP:${nowFormatted}`,
    `DTSTART:${startFormatted}`,
    `DTEND:${endFormatted}`,
    `SUMMARY:Shanyraq Hub: ${event.title}`,
    `DESCRIPTION:${cleanDescription}`,
    `LOCATION:${event.locationAddress || 'Shanyraq Hub Community Space'}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Напоминание о встрече Shanyraq Hub',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `shanyraq-event-${event.id}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
