export interface StockCheck {
  medicine_id: string;
}

export class CheckStockService {
  async addLog(check: StockCheck): Promise<string> {
    console.log(`[CheckStockService] Checking stock for medicine: ${check.medicine_id}`);
    return `STOCK-${Date.now()}`;
  }
}
