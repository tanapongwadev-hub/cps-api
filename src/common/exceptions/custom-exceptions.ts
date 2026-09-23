import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../enums/error-code.enum';
import { toThaiErrorMessage } from '../errors/thai-error-message';

export class CustomHttpException extends HttpException {
  constructor(
    code: ErrorCode,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    path?: string,
  ) {
    super(
      {
        statusCode,
        error: HttpStatus[statusCode],
        code,
        message,
        path,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );
  }
}

export class InvalidCredentialsException extends CustomHttpException {
  constructor(path?: string) {
    super(
      ErrorCode.INVALID_CREDENTIALS,
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      HttpStatus.UNAUTHORIZED,
      path,
    );
  }
}

export class UserInactiveException extends CustomHttpException {
  constructor(path?: string) {
    super(
      ErrorCode.USER_INACTIVE,
      'บัญชีผู้ใช้ถูกระงับการใช้งาน',
      HttpStatus.FORBIDDEN,
      path,
    );
  }
}

export class UserLockedException extends CustomHttpException {
  constructor(path?: string) {
    super(
      ErrorCode.USER_LOCKED,
      'บัญชีผู้ใช้ถูกล็อก',
      HttpStatus.FORBIDDEN,
      path,
    );
  }
}

export class DepartmentSelectionRequiredException extends CustomHttpException {
  constructor(path?: string) {
    super(
      ErrorCode.DEPARTMENT_SELECTION_REQUIRED,
      'กรุณาเลือกแผนกก่อนดำเนินการต่อ',
      HttpStatus.FORBIDDEN,
      path,
    );
  }
}

export class PermissionDeniedException extends CustomHttpException {
  constructor(path?: string) {
    super(
      ErrorCode.PERMISSION_DENIED,
      'คุณไม่มีสิทธิ์ดำเนินการนี้',
      HttpStatus.FORBIDDEN,
      path,
    );
  }
}

export class SessionExpiredException extends CustomHttpException {
  constructor(path?: string) {
    super(
      ErrorCode.SESSION_EXPIRED,
      'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
      HttpStatus.UNAUTHORIZED,
      path,
    );
  }
}

export class SessionRevokedException extends CustomHttpException {
  constructor(path?: string) {
    super(
      ErrorCode.SESSION_REVOKED,
      'เซสชันถูกยกเลิก กรุณาเข้าสู่ระบบอีกครั้ง',
      HttpStatus.UNAUTHORIZED,
      path,
    );
  }
}

export class DuplicateResourceException extends CustomHttpException {
  constructor(resource: string, path?: string) {
    super(
      ErrorCode.DUPLICATE_USERNAME,
      toThaiErrorMessage(`${resource} already exists`, HttpStatus.CONFLICT),
      HttpStatus.CONFLICT,
      path,
    );
  }
}

export class LastSuperAdminProtectedException extends CustomHttpException {
  constructor(path?: string) {
    super(
      ErrorCode.LAST_SUPER_ADMIN_PROTECTED,
      'ไม่สามารถแก้ไขบัญชีผู้ดูแลระบบสูงสุดบัญชีสุดท้ายได้',
      HttpStatus.FORBIDDEN,
      path,
    );
  }
}

export class AssignmentInactiveException extends CustomHttpException {
  constructor(path?: string) {
    super(
      ErrorCode.ASSIGNMENT_INACTIVE,
      'สิทธิ์ประจำแผนกของผู้ใช้ถูกระงับ',
      HttpStatus.FORBIDDEN,
      path,
    );
  }
}

export class AssignmentExpiredException extends CustomHttpException {
  constructor(path?: string) {
    super(
      ErrorCode.ASSIGNMENT_EXPIRED,
      'สิทธิ์ประจำแผนกของผู้ใช้หมดอายุ',
      HttpStatus.FORBIDDEN,
      path,
    );
  }
}
