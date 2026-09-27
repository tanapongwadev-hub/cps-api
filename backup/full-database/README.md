# ย้ายฐานข้อมูล CPS ทั้งหมดไปเครื่องใหม่

โฟลเดอร์นี้ใช้ย้ายฐานข้อมูลทั้งก้อน รวมทุก schema, table, sequence, constraint และข้อมูลทุกแถว เช่น IAM, master data, stock, production plan, job order, session และ audit log

ไฟล์ dump มีข้อมูลจริงและข้อมูลยืนยันตัวตน ห้าม commit หรือเผยแพร่สู่ repository สาธารณะ ควรส่งผ่านอุปกรณ์หรือช่องทางภายในที่เชื่อถือได้เท่านั้น

> ชุดนี้ย้ายเฉพาะ PostgreSQL ไม่รวมไฟล์ใน `uploads/` หากระบบต้องใช้ไฟล์แนบหรือรูปภาพ ต้องคัดลอกโฟลเดอร์ดังกล่าวแยกต่างหาก

## 1. เครื่องต้นทาง

เปิด PowerShell ที่ repository `cps-api` แล้วรัน:

```powershell
.\backup\full-database\export-full-database.ps1
```

จะได้ไฟล์ `cps-database-full.dump` และ checksum ในโฟลเดอร์นี้ จากนั้นคัดลอกโฟลเดอร์ `full-database` ทั้งโฟลเดอร์ไปเครื่องใหม่

## 2. เครื่องปลายทาง (Windows + Docker Desktop)

เปิด PowerShell ในโฟลเดอร์ `full-database` แล้วรัน:

```powershell
Copy-Item .env.example .env
notepad .env
```

ตั้ง `DB_PASSWORD` และเปลี่ยน `DB_PORT` หาก port 5432 ถูกใช้งาน จากนั้น restore:

```powershell
.\restore-full-database.ps1
```

สคริปต์จะตรวจ checksum, ขอให้พิมพ์ชื่อ database เพื่อยืนยัน, สร้าง PostgreSQL ด้วย Docker และ restore ข้อมูลทั้งหมด โดยไม่ต้องติดตั้ง `psql` บน Windows

## 3. ตั้งค่า API ที่เครื่องใหม่

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=<ค่าเดียวกับ full-database/.env>
DB_DATABASE=cps_db
DB_SCHEMA=iam
```

หาก API ทำงานใน Docker container ให้ใช้ `DB_HOST=host.docker.internal` หรือชื่อ service PostgreSQL ตาม network ที่ใช้งาน
