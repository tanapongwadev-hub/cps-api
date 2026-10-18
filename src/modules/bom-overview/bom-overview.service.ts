import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface BomOverviewOwner {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  imagePath: string | null;
  boms: Array<{
    id: string;
    version: string;
    status: string;
    items: Array<{ code: string; name: string; imagePath: string | null; quantity: string; unit: string | null; isScrap: boolean }>;
  }>;
  workflows: Array<{
    id: string;
    version: string;
    status: string;
    steps: Array<{ code: string; name: string }>;
  }>;
}

/** Read-only list of every product / material that has a BOM or a workflow (all versions). */
@Injectable()
export class BomOverviewService {
  constructor(@InjectDataSource() private readonly connection: DataSource) {}

  private build(
    ownerTable: string,
    bomTable: string,
    bomItemTable: string,
    workflowTable: string,
    workflowStepTable: string,
    col: string,
    ownerImageCol: string,
  ): Promise<BomOverviewOwner[]> {
    return this.connection.query(
      `SELECT o.id, o.code, o.name, o.is_active AS "isActive", o.${ownerImageCol} AS "imagePath",
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', b.id, 'version', b.version, 'status', b.status,
            'items', COALESCE((
              SELECT json_agg(json_build_object(
                'code', m.code, 'name', m.name, 'imagePath', m.image_path, 'quantity', i.quantity,
                'unit', u.name_th, 'isScrap', i.is_scrap) ORDER BY i.sort_order, i.id)
              FROM master.${bomItemTable} i
              JOIN master.materials m ON m.id = i.material_id
              LEFT JOIN master.units u ON u.id = i.unit_id
              WHERE i.bom_id = b.id), '[]'::json)
          ) ORDER BY b.id DESC)
          FROM master.${bomTable} b WHERE b.${col} = o.id), '[]'::json) AS boms,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', w.id, 'version', w.version, 'status', w.status,
            'steps', COALESCE((
              SELECT json_agg(json_build_object('code', ps.code, 'name', ps.name_th) ORDER BY s.sort_order, s.id)
              FROM master.${workflowStepTable} s
              JOIN master.process_steps ps ON ps.id = s.process_step_id
              WHERE s.workflow_id = w.id), '[]'::json)
          ) ORDER BY w.id DESC)
          FROM master.${workflowTable} w WHERE w.${col} = o.id), '[]'::json) AS workflows
       FROM master.${ownerTable} o
       WHERE EXISTS (SELECT 1 FROM master.${bomTable} b WHERE b.${col} = o.id)
          OR EXISTS (SELECT 1 FROM master.${workflowTable} w WHERE w.${col} = o.id)
       ORDER BY o.code`,
    ) as Promise<BomOverviewOwner[]>;
  }

  async overview() {
    const [products, materials] = await Promise.all([
      this.build('products', 'product_boms', 'product_bom_items', 'product_workflows', 'product_workflow_steps', 'product_id', 'product_image_path'),
      this.build('materials', 'material_boms', 'material_bom_items', 'material_workflows', 'material_workflow_steps', 'material_id', 'image_path'),
    ]);
    return { products, materials };
  }
}
