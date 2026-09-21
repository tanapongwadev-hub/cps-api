import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Customer } from '../../entities/master/customer.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([Customer])],
  controllers: [CustomersController],
  providers: [CustomersService, PermissionGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
