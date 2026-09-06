import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ProcessStep } from '../../entities/master/process-step.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { ProcessStepsController } from './process-steps.controller';
import { ProcessStepsService } from './process-steps.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([ProcessStep])],
  controllers: [ProcessStepsController],
  providers: [ProcessStepsService, PermissionGuard],
  exports: [ProcessStepsService],
})
export class ProcessStepsModule {}
