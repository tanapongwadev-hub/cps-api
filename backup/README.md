# CPS local database backup

ชุดนี้ใช้เปิด PostgreSQL บน `localhost` สำหรับเครื่องพัฒนาเครื่องอื่น โดยมี:

- โครงสร้างครบของ schema `iam`, `master` และ `inventory`
- ข้อมูลเฉพาะ schema `iam`
- ไม่คัดลอกข้อมูล `iam.auth_sessions` และ `iam.audit_logs`
- schema `master` และ `inventory` เป็นตารางเปล่า

## วิธีใช้งานบนเครื่องใหม่

ต้องติดตั้ง Docker Desktop และเปิด Docker ให้เรียบร้อยก่อน จาก Git Bash หรือ WSL ให้รัน:

```bash
cd backup
./setup-local-database.sh
```

Wizard จะถาม port, database name, username และ password แล้วเขียนลง `.env` ก่อนเปิด container เมื่อสำเร็จให้ตั้งค่า API ให้ใช้:

```env
DB_HOST=localhost
DB_PORT=<ค่าที่เลือก>
DB_USERNAME=<ค่าที่เลือก>
DB_PASSWORD=<ค่าที่เลือก>
DB_DATABASE=<ค่าที่เลือก>
DB_SCHEMA=iam
```

ไฟล์ SQL ใน `init/` ทำงานอัตโนมัติเฉพาะตอน volume ว่างครั้งแรก หากต้องการเริ่มใหม่ทั้งหมด ให้สำรองสิ่งที่ต้องการก่อน แล้วจึงรัน `docker compose down -v` และเปิด wizard ใหม่ คำสั่งนี้ลบฐานข้อมูล local ใน volume แบบกู้คืนไม่ได้

## สร้างไฟล์ backup ใหม่จากฐานข้อมูลต้นทาง

บนเครื่องต้นทาง ให้เปิด PowerShell ที่ repository `cps-api` แล้วรัน:

```powershell
.\backup\export-backup.ps1
```

สคริปต์อ่านค่าการเชื่อมต่อจาก `.env` ของ `cps-api` โดยไม่เขียนรหัสผ่านลงไฟล์ backup จากนั้นสร้าง:

- `init/001-structure.sql` — โครงสร้างทุก schema
- `init/002-iam-seed.sql` — ข้อมูล IAM ยกเว้น session และ audit log
- `iam-schema-and-seed.sql` — query ไฟล์เดียวสำหรับสร้าง schema `iam` พร้อม seed
- `database-schema-and-iam-seed.sql` — ไฟล์เดียวสำหรับสร้างทุก schema และทุก table โดย seed เฉพาะ `iam`

ไฟล์หลักสำหรับนำไปใช้กับเครื่องอื่นคือ `database-schema-and-iam-seed.sql`:

```bash
psql -h localhost -U postgres -d cps_database -v ON_ERROR_STOP=1 -f database-schema-and-iam-seed.sql
```

หากต้องการสร้างเฉพาะ IAM ในฐานข้อมูลที่เตรียมไว้แล้ว สามารถรัน:

```bash
psql -h localhost -U postgres -d cps_database -v ON_ERROR_STOP=1 -f iam-schema-and-seed.sql
```

ไฟล์ IAM seed มีบัญชีผู้ใช้และ password hash จากฐานข้อมูลต้นทาง จึงควรส่งผ่านช่องทางภายในเท่านั้นและไม่ควรนำ folder นี้ไปเผยแพร่สาธารณะ
