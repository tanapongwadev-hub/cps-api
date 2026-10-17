import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from '../../entities/iam/department.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DuplicateResourceException } from '../../common/exceptions/custom-exceptions';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private departmentRepository: Repository<Department>,
  ) {}

  async findAll(page: number = 1, limit: number = 20, search?: string) {
    const queryBuilder = this.departmentRepository
      .createQueryBuilder('dept')
      .select([
        'dept.id',
        'dept.code',
        'dept.nameTh',
        'dept.nameEn',
        'dept.parentId',
        'dept.isActive',
        'dept.createdAt',
      ]);

    if (search) {
      queryBuilder.andWhere(
        '(dept.code ILIKE :search OR dept.nameTh ILIKE :search OR dept.nameEn ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [items, totalItems] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('dept.createdAt', 'ASC')
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
    const department = await this.departmentRepository.findOne({
      where: { id },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }

  async create(createDepartmentDto: CreateDepartmentDto) {
    const existing = await this.departmentRepository.findOne({
      where: { code: createDepartmentDto.code },
    });

    if (existing) {
      throw new DuplicateResourceException('Department code');
    }

    await this.assertValidParent(createDepartmentDto.parentId ?? null, null);
    const department = this.departmentRepository.create(createDepartmentDto);
    return this.departmentRepository.save(department);
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto) {
    const department = await this.findOne(id);
    if (updateDepartmentDto.parentId !== undefined) {
      await this.assertValidParent(updateDepartmentDto.parentId, department.id);
    }
    Object.assign(department, updateDepartmentDto);
    return this.departmentRepository.save(department);
  }

  /**
   * Two levels only: a group (no parent) and its sub-departments. A parent
   * must itself be a group, a department cannot be its own parent, and a
   * department that already has sub-departments cannot become one.
   */
  private async assertValidParent(
    parentId: string | null,
    selfId: string | null,
  ) {
    if (parentId === null) return;
    if (selfId !== null && parentId === selfId) {
      throw new BadRequestException('แผนกไม่สามารถเป็นแผนกแม่ของตัวเองได้');
    }
    const parent = await this.departmentRepository.findOne({
      where: { id: parentId },
    });
    if (!parent) throw new BadRequestException('ไม่พบแผนกแม่ที่เลือก');
    if (parent.parentId) {
      throw new BadRequestException('แผนกแม่ต้องเป็นกลุ่มระดับบนสุดเท่านั้น');
    }
    if (selfId !== null) {
      const children = await this.departmentRepository.count({
        where: { parentId: selfId },
      });
      if (children > 0) {
        throw new BadRequestException(
          'แผนกที่มีแผนกย่อยอยู่ไม่สามารถย้ายไปอยู่ใต้แผนกอื่นได้',
        );
      }
    }
  }

  async remove(id: string) {
    const department = await this.findOne(id);
    await this.departmentRepository.remove(department);
    return { message: 'Department deleted successfully' };
  }
}
