export interface AdminNotification {
  name: string;
  medicine_id: string;
  reason: string;
  priority: string;
}

export class NotifyAdminService {
  async addLog(notification: AdminNotification): Promise<string> {
    console.log(`[NotifyAdminService] Notification: ${notification.reason} for ${notification.name} (Priority: ${notification.priority})`);
    return `NOTIFY-${Date.now()}`;
  }
}
