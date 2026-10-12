import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { MaterialEngineeringController } from './material-engineering.controller';
import { MaterialEngineeringService } from './material-engineering.service';

@Module({ imports: [AccessControlModule], controllers: [MaterialEngineeringController], providers: [MaterialEngineeringService, PermissionGuard] })
export class MaterialEngineeringModule {}
