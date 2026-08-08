import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RejectReason } from '../../entities/master/reject-reason.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { RejectReasonsController } from './reject-reasons.controller';
import { RejectReasonsService } from './reject-reasons.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([RejectReason])],
  controllers: [RejectReasonsController],
  providers: [RejectReasonsService, PermissionGuard],
  exports: [RejectReasonsService],
})
export class RejectReasonsModule {}
