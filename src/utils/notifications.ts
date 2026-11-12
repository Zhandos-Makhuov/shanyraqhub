/**
 * Push notifications and messenger integrations (Telegram / WhatsApp)
 */

export async function requestWebPushPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export function sendLocalPushNotification(title: string, body: string, icon = '/assets/aistudio/IMG_9313_86e71ea6.PNG'): boolean {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  try {
    new Notification(title, {
      body,
      icon,
      badge: icon,
      silent: false,
    });
    return true;
  } catch (err) {
    console.warn('Push notification delivery failed:', err);
    return false;
  }
}

export interface MessengerDispatchPayload {
  channel: 'telegram' | 'whatsapp';
  title: string;
  body: string;
  ctaLink?: string;
  targetDirection?: string;
  recipientCount: number;
}

export function formatTelegramMarkdown(title: string, body: string, ctaLink?: string): string {
  let text = `🏛 *SHANYRAQ HUB COMMUNITY*\n\n*${title}*\n\n${body}`;
  if (ctaLink) {
    text += `\n\n🔗 [Открыть в личном кабинете](${ctaLink})`;
  }
  text += `\n\n_Отправлено через официальный бот @ShanyraqHubBot_`;
  return text;
}

export function formatWhatsAppMessage(title: string, body: string, ctaLink?: string): string {
  let text = `*Shanyraq Hub Community*\n\n*${title}*\n\n${body}`;
  if (ctaLink) {
    text += `\n\nПерейти: ${ctaLink}`;
  }
  return text;
}
