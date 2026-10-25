import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CreateIssueReportDto,
  ListIssueReportsQueryDto,
  UpdateIssueReportDto,
} from './dto/issue-report.dto';

const SELECT = `
  SELECT r.id::text AS id, r.report_no AS "reportNo", r.document_type AS "documentType",
         r.document_no AS "documentNo", r.title, r.description, r.severity, r.status,
         r.resolution, r.created_at AS "createdAt", r.updated_at AS "updatedAt",
         r.resolved_at AS "resolvedAt",
         NULLIF(TRIM(CONCAT(rb.first_name, ' ', rb.last_name)), '') AS "reportedByName",
         rb.username AS "reportedByUsername",
         NULLIF(TRIM(CONCAT(rs.first_name, ' ', rs.last_name)), '') AS "resolvedByName"
  FROM inventory.issue_reports r
  LEFT JOIN iam.users rb ON rb.id = r.reported_by
  LEFT JOIN iam.users rs ON rs.id = r.resolved_by`;

@Injectable()
export class IssueReportsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(query: ListIssueReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: string[] = [];
    const params: unknown[] = [];
    const eq = (column: string, value: unknown) => {
      params.push(value);
      where.push(`${column} = $${params.length}`);
    };
    if (query.status) eq('r.status', query.status);
    if (query.documentType) eq('r.document_type', query.documentType);
    if (query.severity) eq('r.severity', query.severity);
    if (query.search) {
      params.push(`%${query.search}%`);
      const n = params.length;
      where.push(
        `(r.report_no ILIKE $${n} OR r.document_no ILIKE $${n} OR r.title ILIKE $${n})`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = (await this.dataSource.query(
      `${SELECT} ${whereSql} ORDER BY r.created_at DESC, r.id DESC
       LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    )) as unknown[];
    const count = (await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM inventory.issue_reports r ${whereSql}`,
      params,
    )) as Array<{ total: number }>;
    const totalItems = count[0]?.total ?? 0;
    const summaryRows = (await this.dataSource.query(
      `SELECT status, COUNT(*)::int AS count FROM inventory.issue_reports GROUP BY status`,
    )) as Array<{ status: string; count: number }>;
    return {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      },
      summary: Object.fromEntries(
        summaryRows.map((row) => [row.status, row.count]),
      ),
    };
  }

  async create(dto: CreateIssueReportDto, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const seq = (await manager.query(
        `SELECT nextval(pg_get_serial_sequence('inventory.issue_reports', 'id')) AS id`,
      )) as Array<{ id: string }>;
      const id = seq[0].id;
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const reportNo = `ISS-${day}-${String(id).padStart(4, '0')}`;
      await manager.query(
        `INSERT INTO inventory.issue_reports
           (id, report_no, document_type, document_no, title, description, severity, reported_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          reportNo,
          dto.documentType,
          dto.documentNo,
          dto.title,
          dto.description || null,
          dto.severity ?? 'MEDIUM',
          userId,
        ],
      );
      const rows = (await manager.query(`${SELECT} WHERE r.id = $1`, [
        id,
      ])) as unknown[];
      return rows[0];
    });
  }

  async update(id: string, dto: UpdateIssueReportDto, userId: string) {
    const closing = dto.status === 'RESOLVED' || dto.status === 'CLOSED';
    const existing = (await this.dataSource.query(
      `SELECT 1 FROM inventory.issue_reports WHERE id = $1`,
      [id],
    )) as unknown[];
    if (existing.length === 0) {
      throw new NotFoundException('ไม่พบรายการแจ้งปัญหา');
    }
    await this.dataSource.query(
      `UPDATE inventory.issue_reports
          SET status = $2,
              resolution = COALESCE($3, resolution),
              resolved_by = CASE WHEN $4::boolean THEN $5::bigint ELSE NULL END,
              resolved_at = CASE WHEN $4::boolean THEN COALESCE(resolved_at, now()) ELSE NULL END,
              updated_at = now()
        WHERE id = $1`,
      [id, dto.status, dto.resolution || null, closing, userId],
    );
    const rows = (await this.dataSource.query(`${SELECT} WHERE r.id = $1`, [
      id,
    ])) as unknown[];
    return rows[0];
  }
}
