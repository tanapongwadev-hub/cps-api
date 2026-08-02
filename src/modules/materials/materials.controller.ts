import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAnyPermissions } from '../../common/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CreateMaterialDto } from './dto/create-material.dto';
import { ListMaterialsQueryDto } from './dto/list-materials-query.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import type { MaterialImageFile } from './material-image-storage.service';
import {
  MATERIAL_IMAGE_MAX_SIZE,
  MaterialImageStorageService,
} from './material-image-storage.service';
import { MATERIAL_PERMISSIONS } from './material-permissions';
import { MaterialsService } from './materials.service';

@Controller('materials')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly imageStorage: MaterialImageStorageService,
  ) {}

  @Get()
  @RequirePermissions(MATERIAL_PERMISSIONS.VIEW)
  findAll(@Query() query: ListMaterialsQueryDto) {
    return this.materialsService.findAll(query);
  }

  @Get('lookups')
  @RequirePermissions(MATERIAL_PERMISSIONS.VIEW)
  getLookups() {
    return this.materialsService.getLookups();
  }

  @Get(':id')
  @RequirePermissions(MATERIAL_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.materialsService.findOne(id);
  }

  @Post()
  @RequirePermissions(MATERIAL_PERMISSIONS.CREATE)
  create(@Body() dto: CreateMaterialDto, @CurrentUser('id') userId: string) {
    return this.materialsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(MATERIAL_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.materialsService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(MATERIAL_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.materialsService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(MATERIAL_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.materialsService.restore(id, userId);
  }

  @Post('images')
  @RequireAnyPermissions(
    MATERIAL_PERMISSIONS.CREATE,
    MATERIAL_PERMISSIONS.UPDATE,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MATERIAL_IMAGE_MAX_SIZE },
    }),
  )
  stageImage(@UploadedFile() file: MaterialImageFile) {
    return this.imageStorage.stage(file);
  }
}
