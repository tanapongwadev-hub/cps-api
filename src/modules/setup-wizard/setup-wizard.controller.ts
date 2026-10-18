import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleCode } from '../../common/enums/role-code.enum';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { SaveSetupDraftDto } from './dto/save-setup-draft.dto';
import { SetupWizardService } from './setup-wizard.service';

const SETUP_WIZARD_VIEW = 'SETUP_WIZARD_VIEW';

@Controller('setup-wizard')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard, RolesGuard)
export class SetupWizardController {
  constructor(private readonly service: SetupWizardService) {}

  @Get('overview')
  @RequirePermissions(SETUP_WIZARD_VIEW)
  overview() { return this.service.overview(); }

  @Roles(RoleCode.SUPER_ADMIN)
  @Get('drafts')
  @RequirePermissions(SETUP_WIZARD_VIEW)
  list(@CurrentUser('id') userId: string) { return this.service.list(userId); }

  @Roles(RoleCode.SUPER_ADMIN)
  @Get('drafts/:id')
  @RequirePermissions(SETUP_WIZARD_VIEW)
  get(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.get(id, userId); }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post('drafts')
  @RequirePermissions(SETUP_WIZARD_VIEW)
  save(@Body() dto: SaveSetupDraftDto, @CurrentUser('id') userId: string) { return this.service.save(dto, userId); }

  @Roles(RoleCode.SUPER_ADMIN)
  @Delete('drafts/:id')
  @RequirePermissions(SETUP_WIZARD_VIEW)
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.remove(id, userId); }
}
