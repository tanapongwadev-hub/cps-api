import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Unit } from '../../entities/master/unit.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([Unit])],
  controllers: [UnitsController],
  providers: [UnitsService, PermissionGuard],
  exports: [UnitsService],
})
export class UnitsModule {}
