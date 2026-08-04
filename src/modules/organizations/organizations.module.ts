import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Organization } from '../../entities/master/organization.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([Organization])],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, PermissionGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
