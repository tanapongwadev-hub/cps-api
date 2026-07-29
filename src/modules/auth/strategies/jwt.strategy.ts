import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { CustomHttpException } from '../../../common/exceptions/custom-exceptions';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { AuthSession } from '../../../entities/iam/auth-session.entity';
import { UserDepartmentRole } from '../../../entities/iam/user-department-role.entity';
import { User } from '../../../entities/iam/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
    @InjectRepository(UserDepartmentRole)
    private readonly assignmentRepository: Repository<UserDepartmentRole>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.sessionId) {
      throw new CustomHttpException(
        ErrorCode.SESSION_EXPIRED,
        'Invalid token payload',
      );
    }

    const [user, session] = await Promise.all([
      this.userRepository.findOne({ where: { id: payload.sub } }),
      this.sessionRepository.findOne({
        where: { id: payload.sessionId, userId: payload.sub },
      }),
    ]);
    const now = Date.now();
    if (
      !user ||
      !user.isActive ||
      user.isLocked ||
      user.permissionVersion !== payload.permissionVersion ||
      !session ||
      session.revokedAt ||
      new Date(session.expiresAt).getTime() <= now
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    let activeDepartmentId: string | null = null;
    let activeRoleCode = null;
    if (payload.userDepartmentRoleId) {
      const assignment = await this.assignmentRepository.findOne({
        where: {
          id: payload.userDepartmentRoleId,
          userId: payload.sub,
          isActive: true,
        },
        relations: { role: true },
      });
      if (
        !assignment ||
        (assignment.expiredAt &&
          new Date(assignment.expiredAt).getTime() <= now) ||
        !assignment.role ||
        assignment.departmentId !== payload.departmentId ||
        assignment.role.code !== payload.roleCode
      ) {
        throw new UnauthorizedException('Assignment is no longer valid');
      }
      activeDepartmentId = assignment.departmentId;
      activeRoleCode = assignment.role.code;
    }

    return {
      id: payload.sub,
      sessionId: payload.sessionId,
      activeUserDepartmentRoleId: payload.userDepartmentRoleId,
      activeDepartmentId,
      activeRoleCode,
      permissionVersion: user.permissionVersion,
    };
  }
}
