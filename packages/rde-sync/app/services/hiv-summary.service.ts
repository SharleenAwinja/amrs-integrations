import { ResponseToolkit } from "@hapi/hapi";
import { ETL_POOL } from "../db";
import { AffectedRows, PatientIds } from "../models/Model";

class HIVSummaryService {
  async createSummarySyncQueue(request: PatientIds, h: ResponseToolkit) {
    const { patientIds } = request;

    const executingQuery = async (id: string) => {
      const query = `replace into etl.flat_hiv_summary_sync_queue (select patient_id from amrs_migration.patient_identifier where identifier in (
            '${id}'
            ));`;
      const connection = await ETL_POOL.getConnection();
      const [rows] = await connection.execute(query);
      const { affectedRows } = rows as AffectedRows;

      connection.release();
      return affectedRows;
    };

    try {
      if (Array.isArray(patientIds)) {
        let totalRows: number = 0;

        for (const id of patientIds) {
          const response = await executingQuery(id);
          response ? (totalRows += response) : totalRows;
        }

        return h.response({ createdRows: totalRows }).code(201);
      }
    } catch (err) {
      console.error(err);
      return h.response("Internal server error \n " + err).code(500);
    }
  }

  async getSummarySyncQueue(h: ResponseToolkit) {
    try {
      const query = `SELECT 
        CONCAT(pn.given_name,
                ' ',
                pn.middle_name,
                ' ',
                pn.family_name) AS full_name,
        p.gender,
        l.name as location_name,
        fh.date_created,
        fh.rtc_date,
        fh.encounter_datetime as latest_encounter_datetime,
        fh.person_id
    FROM
        etl.flat_hiv_summary_sync_queue hs
            LEFT JOIN
        etl.flat_hiv_summary_v15b fh ON (hs.person_id = fh.person_id)
            INNER JOIN
        amrs_migration.location l ON (fh.location_id = l.location_id)
            LEFT JOIN
        amrs_migration.person p ON (hs.person_id = p.person_id)
            INNER JOIN
        amrs_migration.person_name pn ON p.person_id = pn.person_id
    GROUP BY fh.person_id
    ORDER BY fh.encounter_datetime DESC;`;
      const connection = await ETL_POOL.getConnection();
      const [rows] = await connection.execute(query);
      return h.response(rows).code(201);
    } catch (error) {
      console.error("error", error);
      return h.response(`Internal server error: ${error}`).code(500);
    }
  }
}

export default HIVSummaryService;
