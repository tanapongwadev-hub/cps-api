import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ProcessLine } from '../../entities/master/process-line.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { ProcessLinesController } from './process-lines.controller';
import { ProcessLinesService } from './process-lines.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([ProcessLine])],
  controllers: [ProcessLinesController],
  providers: [ProcessLinesService, PermissionGuard],
  exports: [ProcessLinesService],
})
export class ProcessLinesModule {}
