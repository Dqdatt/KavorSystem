/* Lớp dữ liệu của app. Màn hình và store chỉ đi qua `api`, không import dữ liệu mẫu trực tiếp.
   Hiện dùng bản mock; khi có backend, viết `httpApi` cùng interface `KavorApi` rồi đổi ở cuối file. */
import type { Approval, MyReq, News, OctDay, Payslip } from "../data";
import { APPROVALS_INIT, MY_REQ_INIT, NEWS, OCT, PAY } from "./mock-data";

/* Toàn bộ dữ liệu một nhân viên cần khi mở app */
export type Snapshot = {
  myRequests: MyReq[];
  approvals: Approval[];
  timesheet: OctDay[];
  payslips: Payslip[];
  news: News[];
};

export type PunchRecord = { kind: "in" | "out"; at: number; lat?: number; lng?: number; accuracy?: number };
export type Decision = { ids: string[]; approve: boolean; reason?: string };

export interface KavorApi {
  /* Dữ liệu có sẵn ngay (cache). Bản mock trả dữ liệu mẫu; bản API thật trả cache rỗng đến khi `refresh` xong */
  cached(): Snapshot;
  refresh(): Promise<Snapshot>;
  submitRequest(req: MyReq): Promise<void>;
  cancelRequest(id: string): Promise<void>;
  decide(decision: Decision): Promise<void>;
  recordPunch(punch: PunchRecord): Promise<void>;
  registerDevice(): Promise<void>;
  requestProfileChange(changes: Record<string, string>): Promise<void>;
  askPayroll(month: string, topic: string, message: string): Promise<void>;
}

const clone = (): Snapshot => ({
  myRequests: MY_REQ_INIT.map((r) => ({ ...r })),
  approvals: APPROVALS_INIT.map((r) => ({ ...r })),
  timesheet: OCT.map((d) => ({ ...d })),
  payslips: PAY,
  news: NEWS,
});

/* Mock: mọi thao tác thành công ngay; trạng thái được store tự cập nhật lạc quan */
const mockApi: KavorApi = {
  cached: clone,
  refresh: async () => clone(),
  submitRequest: async () => {},
  cancelRequest: async () => {},
  decide: async () => {},
  recordPunch: async () => {},
  registerDevice: async () => {},
  requestProfileChange: async () => {},
  askPayroll: async () => {},
};

export const api: KavorApi = mockApi;
