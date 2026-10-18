import { Module } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AccessControlModule } from '../access-control/access-control.module';
import { SetupWizardController } from './setup-wizard.controller';
import { SetupWizardService } from './setup-wizard.service';

@Module({
  imports: [AccessControlModule],
  controllers: [SetupWizardController],
  providers: [SetupWizardService, PermissionGuard],
})
export class SetupWizardModule {}
