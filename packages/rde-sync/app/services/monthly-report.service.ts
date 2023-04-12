import { ResponseToolkit } from "@hapi/hapi";
import { ETL_POOL } from "../db";
import { QueueStatus, SP_Params } from "../models/Model";
import { formatDate, getMonthStartDate } from "../utils/DateUtil";
import RdeSyncService from "./rde-sync.service";

interface MonthlyReportQueryParams {
  user_id: number;
  reporting_month: string;
  h: ResponseToolkit;
}

class MonthlyReportService {
  async getHivMonthlyReportFrozen(param: MonthlyReportQueryParams) {
    // what if location changes? getting latest age
    let query = `SELECT 
    hmf.date_created,
    hmf.person_id,
    hmf.person_uuid,
    CONCAT(COALESCE(person_name.given_name, ''),
            ' ',
            COALESCE(person_name.middle_name, ''),
            ' ',
            COALESCE(person_name.family_name, '')) AS patient_name,
    hmf.birthdate,
    TIMESTAMPDIFF(YEAR, hmf.birthdate, CURDATE()) AS age,
    hmf.gender,
    hmf.location_id,
    hmf.clinic,
    hmf.rtc_date,
    hmf.prev_status,
    hmf.status AS frozen_status,
    hl.status AS live_status,
    hmf.next_status,
    rs.reporting_month AS reporting_month,
    rs.status AS queue_status
FROM
    etl.rde_sync_queue rs
        LEFT JOIN
    etl.hiv_monthly_report_dataset_frozen hmf ON hmf.person_id = rs.patient_id
        LEFT JOIN
    hiv_monthly_report_dataset_v1_2 hl ON hmf.person_id = hl.person_id
        LEFT JOIN
    amrs_migration.person_name person_name ON (hmf.person_id = person_name.person_id
        AND (person_name.voided IS NULL
        || person_name.voided = 0)
        AND person_name.preferred = 1)
WHERE
    rs.user_id = ?
        AND rs.status NOT IN ('FROZEN')
        AND  rs.reporting_month = ?
GROUP BY rs.patient_id;`;
    try {
      const connection = await ETL_POOL.getConnection();

      const [rows] = await connection.query(query, [
        param.user_id,
        param.reporting_month,
      ]);
      connection.release();
      return rows;
    } catch (error) {
      console.error(error);
      return param.h.response("Internal server error \n " + error).code(500);
    }
  }

  async queueAndProcessedPatients(
    personIds: number[],
    userId: number,
    reportingMonth: string
  ): Promise<void> {
    const connection = await ETL_POOL.getConnection();
    try {
      await connection.beginTransaction();
      const replaceQuery = `
        REPLACE INTO etl.hiv_monthly_report_dataset_build_queue
        (SELECT DISTINCT patient_id FROM etl.rde_sync_queue WHERE patient_id IN (${personIds
          .map((_, index) => `?`)
          .join(", ")}))
      `;
      await connection.query(replaceQuery, personIds);
      await connection.commit();

      const startOfReportingMonth = `${formatDate(
        getMonthStartDate(new Date(reportingMonth))
      )}`;
      console.log("startDate", startOfReportingMonth);
      //Invoke processing SP
      this.invokeHivMonthlyStoredProcedure(
        {
          queueNumber: userId,
          queueSize: personIds.length,
          log: false,
          cycleSize: 1,
          startDate: startOfReportingMonth,
        },
        personIds
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async invokeHivMonthlyStoredProcedure(
    params: SP_Params,
    patientIds: number[]
  ) {
    const connection = await ETL_POOL.getConnection();
    try {
      const [result] = await connection.execute(
        `CALL generate_hiv_monthly_report_dataset_v1_4('build','${params.queueSize}',${params.queueSize},${params.cycleSize},'${params.startDate}')`
      );
      console.log("Stored procedure execution successful.");

      // update patient queue status to processed
      const rdeSyncService = new RdeSyncService();
      rdeSyncService.updatePatientStatus(patientIds, QueueStatus.PROCESSED);
    } catch (error) {
      console.error(error);
      console.log("Stored procedure execution failed.");
    } finally {
      connection.release();
    }
  }
}

export default MonthlyReportService;
