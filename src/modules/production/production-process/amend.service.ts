import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProductionTransaction } from '../entities/production-transaction.entity';
import { AmendDto } from './dto/amend.dto';
import { lockLotModelLine } from './line-context';
import { ProcessService, type ProduceResult } from './process.service';
import { ReversalService, type ReverseResult } from './reversal.service';
import { loadWipBoxes } from './wip-boxes';

const PRODUCE_TYPES = ['PROCESS_OUTPUT', 'FG_RECEIVE', 'REJECT'];

export interface AmendResult {
  reversal: ReverseResult;
  produce: ProduceResult;
}

/**
 * Edit a produce/receive record while its pieces are still at the step (not
 * transferred or packed): reverses it, then records the new values from the
 * same boxes, in one transaction. If either part fails nothing is written.
 * The reversal's own rule applies: the target lot must still hold every piece.
 */
@Injectable()
export class AmendService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly reversals: ReversalService,
    private readonly process: ProcessService,
  ) {}

  async amend(
    lineId: string,
    targetRequestId: string,
    dto: AmendDto,
    userId: string,
  ): Promise<AmendResult> {
    if (dto.requestId === dto.reverseRequestId) {
      throw new ConflictException('รหัสคำขอแก้ไขซ้ำกัน');
    }
    return this.dataSource.transaction(async (manager) => {
      // Same lock order as produce/reversal: the order line first.
      await lockLotModelLine(manager, lineId);
      const originals = await manager.getRepository(ProductionTransaction).find({
        where: { requestId: targetRequestId, productionOrderLineId: lineId },
        order: { id: 'ASC' },
      });
      if (!originals.length) {
        throw new NotFoundException('ไม่พบรายการบันทึกผลิตที่จะแก้ไข');
      }
      if (originals.some((t) => !PRODUCE_TYPES.includes(t.transactionType))) {
        throw new ConflictException(
          'แก้ไขได้เฉพาะการบันทึกผลิตหรือรับเข้า (ส่งต่อ ปิดยอด แพ็ก ใช้การยกเลิกแทน)',
        );
      }
      const stepIndex = originals[0].stepIndex;

      // Boxes the original drew from: the new record uses the same boxes.
      const pairs = (await manager.query(
        `SELECT DISTINCT wip_id, box_no FROM inventory.production_transaction_boxes
         WHERE transaction_id = ANY($1::bigint[]) AND qty > 0`,
        [originals.map((t) => t.id)],
      )) as unknown as Array<{ wip_id: string; box_no: number }>;

      const reversal = await this.reversals.reverse(
        lineId,
        targetRequestId,
        { requestId: dto.reverseRequestId, reason: dto.reason },
        userId,
        manager,
      );

      let boxes: string[] | undefined;
      if (pairs.length) {
        // Current QR of each box (it changes back after the reversal), FIFO order.
        const wipOrder = (await manager.query(
          `SELECT id FROM inventory.process_wip WHERE id = ANY($1::bigint[])
           ORDER BY received_at, id`,
          [[...new Set(pairs.map((p) => String(p.wip_id)))]],
        )) as unknown as Array<{ id: string }>;
        const byWip = await loadWipBoxes(
          manager,
          wipOrder.map((w) => String(w.id)),
        );
        const wanted = new Set(pairs.map((p) => `${p.wip_id}#${p.box_no}`));
        boxes = wipOrder.flatMap((w) =>
          (byWip.get(String(w.id)) ?? [])
            .filter((b) => wanted.has(`${b.wipId}#${b.boxNo}`))
            .sort((a, b) => a.boxNo - b.boxNo)
            .map((b) => b.qrCode),
        );
      }

      const produce = await this.process.produce(
        lineId,
        stepIndex,
        {
          requestId: dto.requestId,
          goodQty: dto.goodQty,
          rejects: dto.rejects,
          boxes,
          productionDate: dto.productionDate,
          shift: dto.shift,
          remark: dto.remark,
        },
        userId,
        manager,
      );
      return { reversal, produce };
    });
  }
}
