import { ServerRoute } from "@hapi/hapi";
import RdeSyncService from "../services/rde-sync.service";
import MonthlyReportService from "../services/monthly-report.service";
import { QueuePatientPayload, RDEQueuePayload } from "../models/RequestParams";
import { PatientIds } from "../models/Model";
import HIVSummaryService from "../services/hiv-summary.service";

const Joi = require("joi");

export const apiRoutes: ServerRoute[] = [
  {
    method: "POST",
    path: "/api/rde-sync/queue",
    handler: async function (request, h) {
      const rdeSyncService = new RdeSyncService();

      return await rdeSyncService.queueRDEPatients(
        request.payload as RDEQueuePayload,
        h
      );
    },
    options: {
      validate: {
        payload: Joi.object({
          identifiers: Joi.array().items(Joi.string()).required(),
          userId: Joi.string().required(),
          reportingMonth: Joi.string().required(),
        }),
      },
    },
  },
  {
    method: "DELETE",
    path: "/api/rde-sync/patient/{patientId}",
    handler: async function (request, h) {
      const id = request.params.patientId;

      const rdeSyncService = new RdeSyncService();
      return await rdeSyncService.deletePatientRecord(id, h);
    },
    options: {
      validate: {
        params: Joi.object({
          patientId: Joi.string().required(),
        }),
      },
    },
  },
  {
    method: "GET",
    path: "/api/rde-sync/queue-patientlist",
    handler: async function (request, h) {
      const params = request.params || {};

      const reportParams = {
        user_id: request.query?.user_id,
        reporting_month: request.query?.reporting_month,
        h: h,
      };

      const monthlyService = new MonthlyReportService();
      return monthlyService.getHivMonthlyReportFrozen(reportParams);
    },
    options: {
      validate: {
        query: Joi.object({
          user_id: Joi.string().required(),
          reporting_month: Joi.string().required(),
        }),
      },
    },
  },
  {
    method: "POST",
    path: "/api/rde-sync/process-queue-patients",
    handler: async function (request, h) {
      const monthlyService = new MonthlyReportService();

      const {
        patientIds,
        userId,
        reportingMonth,
      } = request.payload as QueuePatientPayload;

      if (
        !patientIds ||
        !Array.isArray(patientIds) ||
        patientIds.length === 0
      ) {
        throw new Error("Invalid personIds provided");
      }
      try {
        await monthlyService.queueAndProcessedPatients(
          patientIds,
          userId,
          reportingMonth
        );
        return h.response({ message: "Processing Queued Patients" }).code(201);
      } catch (error) {
        console.error(error);
        return h
          .response({
            message: "Failed to Queue or Invoke Process the Queued patients",
          })
          .code(500);
      }
    },
    options: {
      validate: {
        payload: Joi.object({
          userId: Joi.number().integer().required(),
          reportingMonth: Joi.string().required(),
          patientIds: Joi.array().required(),
        }),
      },
    },
  },
  {
    method: "GET",
    path: "/api/rde-sync/queue/processing/{userId}",
    handler: async function (request, h) {
      const id = request.params.userId;

      const rdeSyncService = new RdeSyncService();
      const count = await rdeSyncService.processingStatus(id, h);

      return count;
    },
    options: {
      validate: {
        params: Joi.object({
          userId: Joi.number().integer().required(),
        }),
      },
    },
  },
  {
    method: "POST",
    path: "/api/rde-sync/freeze",
    handler: async function (request, h) {
      const rdeSyncService = new RdeSyncService();

      return await rdeSyncService.freezingData(
        request.payload as QueuePatientPayload,
        h
      );
    },
    options: {
      validate: {
        payload: Joi.object({
          patientIds: Joi.array().items(Joi.string()).required(),
          userId: Joi.string().required(),
          reportingMonth: Joi.string().required(),
        }),
      },
    },
  },
  {
    method: "POST",
    path: "/api/rde-sync/post-summary-sync-queue",
    handler: async function (request, h) {
      console.log("request", request.payload);

      const hivSummaryService = new HIVSummaryService();

      const response = await hivSummaryService.createSummarySyncQueue(
        request.payload as PatientIds,
        h
      );
      return response;
    },
    options: {
      validate: {
        payload: Joi.object({
          patientIds: Joi.array().items(Joi.string()).required(),
        }),
      },
    },
  },
  {
    method: "GET",
    path: "/api/rde-sync/get-summary-syc-queue",
    handler: async function (request, h) {
      const hivSummaryService = new HIVSummaryService();
      return await hivSummaryService.getSummarySyncQueue(h);
    },
  },
];
