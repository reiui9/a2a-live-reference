export type RelayEnvelope = {
  id: string;
  type: string;
  from: string;
  to?: string;
  task_id?: string;
  payload: unknown;
  ts: number;
  key_id: string;
  sig: string;
};
