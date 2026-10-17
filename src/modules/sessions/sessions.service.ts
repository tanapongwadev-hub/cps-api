import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthSession } from '../../entities/iam/auth-session.entity';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(AuthSession)
    private authSessionRepository: Repository<AuthSession>,
  ) {}

  async findAll(page: number = 1, limit: number = 20, userId?: string) {
    const queryBuilder = this.authSessionRepository
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.user', 'user')
      .leftJoinAndSelect('session.activeUserDepartmentRole', 'udr')
      .leftJoinAndSelect('udr.department', 'department')
      .leftJoinAndSelect('udr.role', 'role')
      .select([
        'session.id',
        'session.createdAt',
        'session.expiresAt',
        'session.revokedAt',
        'session.ipAddress',
        'user.id',
        'user.username',
        'user.firstName',
        'user.lastName',
        'udr.id',
        'department.id',
        'department.code',
        'department.nameTh',
        'role.id',
        'role.code',
        'role.nameTh',
      ]);

    if (userId) {
      queryBuilder.andWhere('session.userId = :userId', { userId });
    }

    queryBuilder.orderBy('session.createdAt', 'DESC');

    const [items, totalItems] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findOne(id: string) {
    const session = await this.authSessionRepository.findOne({
      where: { id },
      relations: ['user', 'activeUserDepartmentRole'],
    });
    if (!session) {
      throw new Error('Session not found');
    }
    return session;
  }

  async revoke(id: string) {
    const session = await this.findOne(id);
    session.revokedAt = new Date();
    await this.authSessionRepository.save(session);
    return { message: 'Session revoked successfully' };
  }

  async revokeAllUserSessions(userId: string) {
    await this.authSessionRepository
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revokedAt: new Date() })
      .where('userId = :userId', { userId })
      .andWhere('revokedAt IS NULL')
      .execute();

    return { message: 'All user sessions revoked successfully' };
  }
}
