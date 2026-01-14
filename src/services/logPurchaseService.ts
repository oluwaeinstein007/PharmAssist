export interface PurchaseLog {
  name: string;
  medicine_id: string;
  customer_id: string;
  purchase_date: string;
  quantity: number;
  total_price: number;
}

export class LogPurchaseService {
  private logs: PurchaseLog[] = [];

  async addLog(log: PurchaseLog): Promise<string> {
    this.logs.push(log);
    const logId = `LOG-${Date.now()}`;
    console.log(`[LogPurchaseService] Added log: ${logId}`);
    return logId;
  }

  async getLogs(): Promise<PurchaseLog[]> {
    return this.logs;
  }
}

export class FindAlternativesService {
  async addLog(log: PurchaseLog): Promise<string> {
    console.log(`[FindAlternativesService] Processing alternatives for: ${log.name}`);
    return `ALT-${Date.now()}`;
  }
}
