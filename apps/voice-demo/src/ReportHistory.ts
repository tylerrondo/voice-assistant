export interface ReportHistoryEntry {
  timestamp: string;
  tester: string;
  status: 'PASS' | 'PASS WITH WARNINGS' | 'FAIL';
}

export class ReportHistory {
  private storageKey = 'validation_bench_history';

  // App.ts shuni chaqiradi: reportHistory.add(report)
  public add(report: any): void {
    const history = this.getAll();

    const newRecord: ReportHistoryEntry = {
      timestamp: new Date().toISOString(),
      tester: report?.Session?.tester || "Tester-1",
      status: report?.Summary?.status || "PASS"
    };

    history.unshift(newRecord);

    // Faqat oxirgi 10 ta natijani saqlaymiz
    if (history.length > 10) {
      history.pop();
    }

    localStorage.setItem(this.storageKey, JSON.stringify(history));
  }

  // App.ts shuni chaqiradi: reportHistory.getAll()
  public getAll(): ReportHistoryEntry[] {
    const data = localStorage.getItem(this.storageKey);
    return data ? JSON.parse(data) : [];
  }

  public clearHistory(): void {
    localStorage.removeItem(this.storageKey);
  }
}