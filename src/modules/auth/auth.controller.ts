import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { SelectDepartmentDto } from './dto/select-department.dto';
import { SwitchDepartmentDto } from './dto/switch-department.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RoleCode } from '../../common/enums/role-code.enum';
import type { CurrentUserWithAssignment } from '../../common/interfaces/current-user.interface';
import { InvalidCredentialsException } from '../../common/exceptions/custom-exceptions';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    await this.authService.recordLoginAttempt(loginDto.username);
    let user;
    try {
      user = await this.authService.validateUser(
        loginDto.username,
        loginDto.password,
      );
    } catch (error) {
      await this.authService.recordLoginFailure(
        loginDto.username,
        'AUTH_DENIED',
      );
      throw error;
    }

    if (!user) {
      await this.authService.recordLoginFailure(
        loginDto.username,
        'INVALID_CREDENTIALS',
      );
      throw new InvalidCredentialsException();
    }

    const response = await this.authService.login(user);
    await this.authService.recordLoginSuccess(
      user.id,
      'requiresDepartmentSelection' in response &&
        response.requiresDepartmentSelection === true,
    );
    return response;
  }

  @Public()
  @Post('select-department')
  async selectDepartment(@Body() selectDepartmentDto: SelectDepartmentDto) {
    const token = selectDepartmentDto.departmentSelectionToken;
    if (!token) {
      throw new UnauthorizedException('Department selection token is required');
    }

    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>(
          'JWT_DEPARTMENT_SELECTION_SECRET',
        ),
      });
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired department selection token',
      );
    }

    const response = await this.authService.selectDepartment(
      payload.sub,
      selectDepartmentDto.userDepartmentRoleId,
    );
    await this.authService.recordDepartmentSelected(
      payload.sub,
      selectDepartmentDto.userDepartmentRoleId,
    );
    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Post('switch-department')
  async switchDepartment(
    @CurrentUser() user: CurrentUserWithAssignment,
    @Body() switchDepartmentDto: SwitchDepartmentDto,
  ) {
    return await this.authService.switchDepartment(
      user.id,
      switchDepartmentDto.userDepartmentRoleId,
    );
  }

  @Public()
  @Post(['refresh', 'refresh-token'])
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return await this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() user: CurrentUserWithAssignment) {
    await this.authService.logout(user.sessionId, user.id);
    return { success: true, message: 'Logout successful' };
  }

  @Public()
  @Post('logout-refresh')
  async logoutRefresh(@Body() body: RefreshTokenDto) {
    await this.authService.logoutWithRefreshToken(body.refreshToken);
    return { success: true, message: 'Logout successful' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@CurrentUser() user: CurrentUserWithAssignment) {
    return await this.authService.getMe(
      user.id,
      user.activeUserDepartmentRoleId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/menus')
  async getMyMenus(@CurrentUser() user: CurrentUserWithAssignment) {
    return await this.authService.getMyMenus(user.activeRoleCode as RoleCode);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/permissions')
  async getMyPermissions(@CurrentUser() user: CurrentUserWithAssignment) {
    return await this.authService.getMyPermissions(
      user.id,
      user.activeRoleCode as RoleCode,
    );
  }
}
