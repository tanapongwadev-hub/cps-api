import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Material } from '../../entities/master/material.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';

export interface StockBalanceResponse {
  materialId: string;
  materialCode: string;
  materialName: string;
  quantity: string;
  unitCode: string;
  unitNameTh: string;
  lastMovementAt: string | null;
}

@Injectable()
export class StockBalancesService {
  constructor(
    @InjectRepository(StockBalance)
    private stockBalanceRepository: Repository<StockBalance>,
    @InjectRepository(Material)
    private materialRepository: Repository<Material>,
  ) {}

  async getByMaterialId(materialId: string): Promise<StockBalanceResponse> {
    const material = await this.materialRepository.findOne({
      where: { id: materialId },
      relations: ['unit'],
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    const stockBalance = await this.stockBalanceRepository.findOne({
      where: { materialId },
    });

    return {
      materialId,
      materialCode: material.code,
      materialName: material.name,
      quantity: stockBalance?.quantity ?? '0',
      unitCode: material.unit?.code ?? '',
      unitNameTh: material.unit?.nameTh ?? '',
      lastMovementAt: stockBalance?.lastMovementAt?.toISOString() ?? null,
    };
  }

  async getAll(): Promise<StockBalanceResponse[]> {
    const stockBalances = await this.stockBalanceRepository.find({
      relations: ['material', 'material.unit'],
    });

    return stockBalances.map((sb) => ({
      materialId: sb.materialId,
      materialCode: sb.material?.code ?? '',
      materialName: sb.material?.name ?? '',
      quantity: sb.quantity,
      unitCode: sb.material?.unit?.code ?? '',
      unitNameTh: sb.material?.unit?.nameTh ?? '',
      lastMovementAt: sb.lastMovementAt?.toISOString() ?? null,
    }));
  }
}
