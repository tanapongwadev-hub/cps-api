import { HttpStatus } from '@nestjs/common';

const THAI_TEXT = /[\u0E00-\u0E7F]/;

const EXACT_MESSAGES: Record<string, string> = {
  'Invalid username or password': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  'Invalid credentials': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  'User account is inactive': 'บัญชีผู้ใช้ถูกระงับการใช้งาน',
  'User account is locked': 'บัญชีผู้ใช้ถูกล็อก',
  'Department selection is required': 'กรุณาเลือกแผนกก่อนดำเนินการต่อ',
  'You do not have permission to perform this action':
    'คุณไม่มีสิทธิ์ดำเนินการนี้',
  'Session has expired': 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
  'Session has been revoked': 'เซสชันถูกยกเลิก กรุณาเข้าสู่ระบบอีกครั้ง',
  'Access token rejected':
    'ข้อมูลยืนยันตัวตนไม่ถูกต้อง กรุณาเข้าสู่ระบบอีกครั้ง',
  'Refresh token rejected': 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
  'Invalid token payload': 'ข้อมูลยืนยันตัวตนไม่ถูกต้อง',
  'Account unavailable': 'บัญชีนี้ไม่พร้อมใช้งาน',
  'Assignment is no longer valid': 'สิทธิ์การใช้งานของผู้ใช้ไม่ถูกต้องแล้ว',
  'Authentication session cannot be refreshed':
    'ไม่สามารถต่ออายุเซสชันได้ กรุณาเข้าสู่ระบบอีกครั้ง',
  'Department selection token is required':
    'ไม่พบข้อมูลสำหรับเลือกแผนก กรุณาเข้าสู่ระบบอีกครั้ง',
  'Invalid or expired department selection token':
    'ข้อมูลสำหรับเลือกแผนกไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
  'Cannot modify the last super admin account':
    'ไม่สามารถแก้ไขบัญชีผู้ดูแลระบบสูงสุดบัญชีสุดท้ายได้',
  'Cannot remove the last super admin':
    'ไม่สามารถลบผู้ดูแลระบบสูงสุดคนสุดท้ายได้',
  'Cannot disable the last super admin':
    'ไม่สามารถระงับผู้ดูแลระบบสูงสุดคนสุดท้ายได้',
  'User department assignment is inactive': 'สิทธิ์ประจำแผนกของผู้ใช้ถูกระงับ',
  'User department assignment has expired': 'สิทธิ์ประจำแผนกของผู้ใช้หมดอายุ',
  'At least one disbursement item is required':
    'กรุณาระบุรายการจ่ายออกอย่างน้อย 1 รายการ',
  'Reason is required for stock_cut disbursement':
    'กรุณาระบุเหตุผลสำหรับการตัดสต็อก',
  'Disbursement date cannot be in the future':
    'วันที่จ่ายออกต้องไม่เป็นวันที่ในอนาคต',
  'Requested quantity must be greater than 0': 'จำนวนที่ต้องการต้องมากกว่า 0',
  'No items to disburse': 'ไม่มีรายการสำหรับจ่ายออก',
  'Materials disbursement already cancelled': 'รายการจ่ายออกถูกยกเลิกแล้ว',
  'Cancellation reason is required': 'กรุณาระบุเหตุผลการยกเลิก',
  'Excel file is required': 'กรุณาเลือกไฟล์ Excel',
  'Unable to read the uploaded Excel file':
    'ไม่สามารถอ่านไฟล์ Excel ที่อัปโหลดได้',
  'The Excel file has no worksheet': 'ไฟล์ Excel ไม่มีแผ่นงาน',
  'The Excel file contains no Plan Lines': 'ไฟล์ Excel ไม่มีรายการแผนการผลิต',
  'Production Plan requires at least one Plan Line':
    'แผนการผลิตต้องมีรายการสินค้าอย่างน้อย 1 รายการ',
  'Production Plan has no active Reservation to issue':
    'แผนการผลิตไม่มีรายการกันสต็อกที่พร้อมเบิก',
  'A reserved package no longer exists': 'ไม่พบ package ที่เคยกันสต็อกไว้',
  'Insufficient stock to approve the Production Plan':
    'สต็อกไม่เพียงพอสำหรับอนุมัติแผนการผลิต',
  'Failed to generate QR code': 'ไม่สามารถสร้าง QR Code ได้',
  'Failed to generate pieces QR code': 'ไม่สามารถสร้าง QR Code ระดับชิ้นได้',
  'Failed to generate package QR codes':
    'ไม่สามารถสร้าง QR Code ของ package ได้',
};

const RESOURCE_NAMES: Record<string, string> = {
  user: 'ผู้ใช้',
  username: 'ชื่อผู้ใช้',
  'user assignment': 'สิทธิ์ประจำแผนกของผู้ใช้',
  department: 'แผนก',
  role: 'บทบาท',
  menu: 'เมนู',
  permission: 'สิทธิ์',
  category: 'หมวดหมู่',
  customer: 'ลูกค้า',
  supplier: 'ผู้จำหน่าย',
  unit: 'หน่วยนับ',
  location: 'สถานที่จัดเก็บ',
  organization: 'หน่วยงาน',
  'parent organization': 'หน่วยงานหลัก',
  material: 'วัตถุดิบ',
  'material type': 'ประเภทวัตถุดิบ',
  'material model': 'รุ่นวัตถุดิบ',
  'material receiving': 'รายการรับเข้า',
  'materials disbursement': 'รายการจ่ายออก',
  product: 'สินค้า',
  'product type': 'ประเภทสินค้า',
  'product model': 'รุ่นสินค้า',
  'production plan': 'แผนการผลิต',
  'loading point': 'จุดขนถ่าย',
  'delivery type': 'ประเภทการจัดส่ง',
  'reject reason': 'เหตุผลการปฏิเสธ',
  'process line': 'สายการผลิต',
  'process step': 'ขั้นตอนการผลิต',
  'status item': 'สถานะ',
  bom: 'BOM',
};

const STATUS_FALLBACKS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง',
  [HttpStatus.UNAUTHORIZED]: 'กรุณาเข้าสู่ระบบอีกครั้ง',
  [HttpStatus.FORBIDDEN]: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
  [HttpStatus.NOT_FOUND]: 'ไม่พบข้อมูลที่ต้องการ',
  [HttpStatus.CONFLICT]:
    'ข้อมูลมีการเปลี่ยนแปลงหรือขัดแย้ง กรุณาโหลดใหม่แล้วลองอีกครั้ง',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'ข้อมูลหรือไฟล์มีขนาดใหญ่เกินกำหนด',
  [HttpStatus.TOO_MANY_REQUESTS]:
    'มีการใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองอีกครั้ง',
  [HttpStatus.INTERNAL_SERVER_ERROR]:
    'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง',
  [HttpStatus.BAD_GATEWAY]: 'ไม่สามารถเชื่อมต่อบริการที่เกี่ยวข้องได้',
  [HttpStatus.SERVICE_UNAVAILABLE]:
    'ระบบไม่พร้อมให้บริการชั่วคราว กรุณาลองใหม่อีกครั้ง',
  [HttpStatus.GATEWAY_TIMEOUT]:
    'ระบบใช้เวลาตอบสนองนานเกินไป กรุณาลองใหม่อีกครั้ง',
};

export function thaiStatusLabel(statusCode: number): string {
  if (statusCode === 400) return 'คำขอไม่ถูกต้อง';
  if (statusCode === 401) return 'ยังไม่ได้เข้าสู่ระบบ';
  if (statusCode === 403) return 'ไม่มีสิทธิ์เข้าถึง';
  if (statusCode === 404) return 'ไม่พบข้อมูล';
  if (statusCode === 409) return 'ข้อมูลขัดแย้ง';
  if (statusCode >= 500) return 'ข้อผิดพลาดภายในระบบ';
  return 'เกิดข้อผิดพลาด';
}

export function thaiErrorFallback(statusCode: number): string {
  return (
    STATUS_FALLBACKS[statusCode] ??
    (statusCode >= 500
      ? 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง'
      : 'เกิดข้อผิดพลาด กรุณาตรวจสอบแล้วลองอีกครั้ง')
  );
}

export function toThaiErrorMessage(
  value: unknown,
  statusCode = HttpStatus.BAD_REQUEST,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    return thaiErrorFallback(statusCode);
  }

  const message = value.trim();
  if (THAI_TEXT.test(message)) return message;
  if (EXACT_MESSAGES[message]) return EXACT_MESSAGES[message];

  const simpleNotFound = message.match(/^(.+?) not found(?: after write)?$/i);
  if (simpleNotFound) {
    const known = knownResourceName(simpleNotFound[1]);
    if (known) return `ไม่พบ${known}`;
  }

  const notFound = message.match(
    /^(.+?)(?: with id)? ([^ ]+) not found(?: after write)?$/i,
  );
  if (notFound) return `ไม่พบ${resourceName(notFound[1])} ${notFound[2]}`;

  if (simpleNotFound) return `ไม่พบ${resourceName(simpleNotFound[1])}`;

  const inactive = message.match(/^(.+?) is inactive$/i);
  if (inactive) {
    const known = knownResourceName(inactive[1]);
    if (known) return `${known}ถูกระงับการใช้งาน`;
    const identified = inactive[1].match(/^(.+?) ([^ ]+)$/);
    if (identified) {
      return `${resourceName(identified[1])} ${identified[2]} ถูกระงับการใช้งาน`;
    }
    return `${resourceName(inactive[1])}ถูกระงับการใช้งาน`;
  }

  const duplicateCode = message.match(/^(.+?) code already exists$/i);
  if (duplicateCode) {
    return `รหัส${resourceName(duplicateCode[1])}นี้มีอยู่ในระบบแล้ว`;
  }

  const duplicate = message.match(/^(.+?) already exists$/i);
  if (duplicate) return `${resourceName(duplicate[1])}นี้มีอยู่ในระบบแล้ว`;

  const updated = message.match(/^(.+?) has been updated$/i);
  if (updated) {
    return `${resourceName(updated[1])}ถูกแก้ไขโดยผู้ใช้อื่น กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง`;
  }

  const required = message.match(/^(.+?) is required$/i);
  if (required) return `กรุณาระบุ ${required[1]}`;

  const positive = message.match(
    /^(.+?) must be (?:greater than 0|positive)$/i,
  );
  if (positive) return `${positive[1]} ต้องมากกว่า 0`;

  const minimum = message.match(/^(.+?) must be >= ([\d.]+)$/i);
  if (minimum) return `${minimum[1]} ต้องไม่น้อยกว่า ${minimum[2]}`;

  const dateFormat = message.match(/^(.+?) must be in YYYY-MM-DD format$/i);
  if (dateFormat) return `${dateFormat[1]} ต้องอยู่ในรูปแบบ YYYY-MM-DD`;

  const futureDate = message.match(/^(.+?) cannot be in the future$/i);
  if (futureDate) return `${futureDate[1]} ต้องไม่เป็นวันที่ในอนาคต`;

  const invalidId = message.match(/^(.+?) must be a valid id$/i);
  if (invalidId) return `${invalidId[1]} ไม่ใช่รหัสอ้างอิงที่ถูกต้อง`;

  const insufficient = message.match(
    /^Insufficient stock for material (.+?)\. Requested: (.+?), Available: (.+)$/i,
  );
  if (insufficient) {
    return `สต็อกวัตถุดิบ ${insufficient[1]} ไม่เพียงพอ (ต้องการ ${insufficient[2]}, คงเหลือที่ใช้ได้ ${insufficient[3]})`;
  }

  const onlyDraft = message.match(
    /^Only an? (DRAFT|APPROVED|draft)(?: (?:material )?(receiving|disbursement|Production Plan))? can be (edited|deleted|confirmed|approved|issued|cancelled)$/i,
  );
  if (onlyDraft) {
    const status =
      onlyDraft[1].toUpperCase() === 'DRAFT' ? 'ร่าง' : 'อนุมัติแล้ว';
    return `ดำเนินการนี้ได้เฉพาะรายการสถานะ${status}เท่านั้น`;
  }

  const propertyNotAllowed = message.match(/^property (.+) should not exist$/i);
  if (propertyNotAllowed)
    return `ไม่อนุญาตให้ส่งฟิลด์ ${propertyNotAllowed[1]}`;

  return thaiErrorFallback(statusCode);
}

export function toThaiValidationMessage(
  property: string,
  constraint: string,
  original: string,
): string {
  const label = property || 'ข้อมูล';
  const translated = toThaiErrorMessage(original, HttpStatus.BAD_REQUEST);
  if (translated !== thaiErrorFallback(HttpStatus.BAD_REQUEST))
    return translated;

  const byConstraint: Record<string, string> = {
    isDefined: `กรุณาระบุ ${label}`,
    isNotEmpty: `กรุณาระบุ ${label}`,
    isString: `${label} ต้องเป็นข้อความ`,
    isNumber: `${label} ต้องเป็นตัวเลข`,
    isInt: `${label} ต้องเป็นจำนวนเต็ม`,
    isBoolean: `${label} ต้องเป็นค่าจริงหรือเท็จ`,
    isArray: `${label} ต้องเป็นรายการ`,
    arrayNotEmpty: `${label} ต้องมีอย่างน้อย 1 รายการ`,
    isEnum: `${label} มีค่าไม่ถูกต้อง`,
    isEmail: `${label} ต้องเป็นอีเมลที่ถูกต้อง`,
    isUUID: `${label} ต้องเป็น UUID ที่ถูกต้อง`,
    isDateString: `${label} ต้องเป็นวันที่ที่ถูกต้อง`,
    isISO8601: `${label} ต้องเป็นวันที่และเวลาที่ถูกต้อง`,
    min: `${label} มีค่าน้อยกว่าที่กำหนด`,
    max: `${label} มีค่ามากกว่าที่กำหนด`,
    minLength: `${label} สั้นกว่าที่กำหนด`,
    maxLength: `${label} ยาวเกินกว่าที่กำหนด`,
    matches: `${label} มีรูปแบบไม่ถูกต้อง`,
    whitelistValidation: `ไม่อนุญาตให้ส่งฟิลด์ ${label}`,
  };

  return byConstraint[constraint] ?? `${label} มีค่าไม่ถูกต้อง`;
}

function resourceName(value: string): string {
  const normalized = value.trim().toLowerCase();
  return RESOURCE_NAMES[normalized] ?? value.trim();
}

function knownResourceName(value: string): string | undefined {
  return RESOURCE_NAMES[value.trim().toLowerCase()];
}
