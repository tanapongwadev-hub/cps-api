import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { User } from '../../entities/iam/user.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { Department } from '../../entities/iam/department.entity';
import { Role } from '../../entities/iam/role.entity';
import { Action } from '../../entities/iam/action.entity';
import { RoleAction } from '../../entities/iam/role-action.entity';
import { Permission } from '../../entities/iam/permission.entity';
import { Menu } from '../../entities/iam/menu.entity';
import { AuthSession } from '../../entities/iam/auth-session.entity';
import { AuditLog } from '../../entities/iam/audit-log.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { PermissionGuard } from '../../common/guards/permission.guard';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      User,
      UserDepartmentRole,
      UserDepartmentPermission,
      Department,
      Role,
      Action,
      RoleAction,
      Permission,
      Menu,
      AuthSession,
      AuditLog,
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    LocalStrategy,
    PasswordService,
    TokenService,
    PermissionGuard,
  ],
  exports: [AuthService],
})
export class AuthModule {}
