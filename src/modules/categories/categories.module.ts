import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Category } from '../../entities/master/category.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([Category])],
  controllers: [CategoriesController],
  providers: [CategoriesService, PermissionGuard],
  exports: [CategoriesService],
})
export class CategoriesModule {}
