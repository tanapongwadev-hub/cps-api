import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/iam/audit-log.entity';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  private actor(log: AuditLog) {
    if (!log.actorUser) return null;
    return {
      id: log.actorUser.id,
      username: log.actorUser.username,
      firstName: log.actorUser.firstName,
      lastName: log.actorUser.lastName,
    };
  }

  private redact(value: unknown): unknown {
    const sensitive = /password|token|secret|cookie|authorization|credential|hash/i;
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitive.test(key) ? '***' : this.redact(item),
      ]),
    );
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    userId?: string,
    action?: string,
  ) {
    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.actorUser', 'user')
      .select([
        'audit.id',
        'audit.eventId',
        'audit.eventName',
        'audit.schemaVersion',
        'audit.stream',
        'audit.outcome',
        'audit.action',
        'audit.targetType',
        'audit.targetId',
        'audit.correlationId',
        'audit.occurredAt',
        'audit.createdAt',
        'audit.ipAddress',
        'user.id',
        'user.username',
        'user.firstName',
        'user.lastName',
      ]);

    if (userId) {
      queryBuilder.andWhere('audit.actorUserId = :userId', { userId });
    }

    if (action) {
      queryBuilder.andWhere('audit.action ILIKE :action', {
        action: `%${action}%`,
      });
    }

    queryBuilder.orderBy('audit.createdAt', 'DESC');

    const [items, totalItems] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((item) => ({
        id: item.id,
        eventId: item.eventId,
        eventName: item.eventName,
        schemaVersion: item.schemaVersion,
        stream: item.stream,
        outcome: item.outcome,
        action: item.action,
        targetType: item.targetType,
        targetId: item.targetId,
        correlationId: item.correlationId,
        occurredAt: item.occurredAt,
        createdAt: item.createdAt,
        ipAddress: item.ipAddress,
        actorUser: this.actor(item),
      })),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findOne(id: string) {
    const auditLog = await this.auditLogRepository
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.actorUser', 'user')
      .select([
        'audit.id',
        'audit.eventId',
        'audit.eventName',
        'audit.schemaVersion',
        'audit.stream',
        'audit.outcome',
        'audit.actorUserId',
        'audit.departmentId',
        'audit.action',
        'audit.targetType',
        'audit.targetId',
        'audit.beforeData',
        'audit.afterData',
        'audit.ipAddress',
        'audit.traceId',
        'audit.correlationId',
        'audit.requestId',
        'audit.reason',
        'audit.userAgent',
        'audit.createdAt',
        'audit.occurredAt',
        'user.id',
        'user.username',
        'user.firstName',
        'user.lastName',
      ])
      .where('audit.id = :id', { id })
      .getOne();
    if (!auditLog) {
      throw new NotFoundException('Audit log not found');
    }
    return {
      id: auditLog.id,
      eventId: auditLog.eventId,
      eventName: auditLog.eventName,
      schemaVersion: auditLog.schemaVersion,
      stream: auditLog.stream,
      outcome: auditLog.outcome,
      actorUserId: auditLog.actorUserId,
      departmentId: auditLog.departmentId,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      beforeData: this.redact(auditLog.beforeData),
      afterData: this.redact(auditLog.afterData),
      ipAddress: auditLog.ipAddress,
      traceId: auditLog.traceId,
      correlationId: auditLog.correlationId,
      requestId: auditLog.requestId,
      reason: auditLog.reason,
      userAgent: auditLog.userAgent,
      createdAt: auditLog.createdAt,
      occurredAt: auditLog.occurredAt,
      actorUser: this.actor(auditLog),
    };
  }
}
