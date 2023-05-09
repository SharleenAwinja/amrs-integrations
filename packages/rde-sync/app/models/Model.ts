import { string } from "joi";

export interface SP_Params {
  queueNumber: number;
  queueSize: number;
  log: boolean;
  cycleSize: number;
  startDate: string;
}

export enum QueueStatus {
  QUEUED,
  PROCESSED,
  FROZEN,
}

export interface AffectedRows {
  affectedRows: number;
}

export interface PatientIds {
  patientIds: string[];
}
export interface ResponseObject {
  affectedRows: number;
  existingPatients: string[];
}
