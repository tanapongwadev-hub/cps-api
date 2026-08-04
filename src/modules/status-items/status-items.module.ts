import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { StatusItem } from '../../entities/master/status-item.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { StatusItemsController } from './status-items.controller';
import { StatusItemsService } from './status-items.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([StatusItem])],
  controllers: [StatusItemsController],
  providers: [StatusItemsService, PermissionGuard],
  exports: [StatusItemsService],
})
export class StatusItemsModule {}
