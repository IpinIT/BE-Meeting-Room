# Meeting Room Booking System

Sistem booking ruang meeting kantor berbasis web.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT (httpOnly cookie)
- **Deploy**: Vercel (frontend) + Railway (backend + database)

---

## Setup Backend (server/)

### 1. Install dependencies
```bash
cd server
npm install
```

### 2. Setup environment variables
```bash
cp .env.example .env
```
Isi `.env` dengan nilai yang sesuai:
```
DATABASE_URL="postgresql://user:password@host:5432/dbname"
JWT_SECRET="ganti-dengan-string-random-panjang"
JWT_REFRESH_SECRET="ganti-dengan-string-random-panjang-lainnya"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=5000
CLIENT_URL="http://localhost:5173"
NODE_ENV="development"
```

### 3. Setup database

**Cara 1: Pakai Railway PostgreSQL (Recommended)**
- Buat project baru di Railway
- Tambahkan PostgreSQL plugin
- Copy DATABASE_URL dari Railway ke `.env`

**Cara 2: Local PostgreSQL**
- Install PostgreSQL
- Buat database baru: `createdb meeting_room_db`

### 4. Jalankan SQL migration
Buka Railway database console atau psql, lalu jalankan:
```sql
-- Copy paste isi file prisma/migration.sql
```

File migration ada di: `server/prisma/migration.sql`

### 5. Generate Prisma Client
```bash
npm run db:generate
```

### 6. Jalankan server
```bash
# Development
npm run dev

# Production
npm start
```

Server berjalan di: `http://localhost:5000`

---

## API Endpoints

### Auth
| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| POST | /api/auth/register | - | Daftar akun baru |
| POST | /api/auth/login | - | Login |
| POST | /api/auth/logout | - | Logout |
| POST | /api/auth/refresh | - | Refresh access token |
| GET | /api/auth/me | ✅ | Data user yang login |

### Rooms
| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| GET | /api/rooms | - | List semua ruangan |
| GET | /api/rooms/:id | - | Detail ruangan + booking aktif |
| POST | /api/rooms | Admin | Tambah ruangan |
| PUT | /api/rooms/:id | Admin | Edit ruangan |
| DELETE | /api/rooms/:id | Admin | Hapus ruangan |

### Bookings
| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| GET | /api/bookings | ✅ | Booking milik user login |
| GET | /api/bookings/all | Admin | Semua booking |
| POST | /api/bookings | ✅ | Buat booking baru |
| PUT | /api/bookings/:id/cancel | ✅ | Batalkan booking |

### Users (Admin Only)
| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| GET | /api/users | Admin | List semua user |
| GET | /api/users/:id | Admin | Detail user |
| POST | /api/users | Admin | Tambah user |
| PUT | /api/users/:id | Admin | Edit user |
| DELETE | /api/users/:id | Admin | Hapus user |

### Profile
| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| PUT | /api/profile | ✅ | Update profil sendiri |

---

## Default Admin Account
Setelah menjalankan migration SQL:
- **Email**: admin@company.com
- **Password**: password

> ⚠️ Ganti password admin segera setelah pertama kali login!

---

## Deploy ke Railway

1. Push kode ke GitHub
2. Buat project baru di Railway
3. Connect ke GitHub repository
4. Set root directory ke `server/`
5. Tambahkan PostgreSQL plugin di Railway
6. Set environment variables di Railway dashboard
7. Jalankan SQL migration via Railway database console
8. Deploy otomatis berjalan

---

## Struktur Project

```
server/
├── prisma/
│   ├── schema.prisma        # Prisma schema
│   └── migration.sql        # SQL migration (jalankan manual)
├── src/
│   ├── config/
│   │   └── prisma.js        # Prisma client singleton
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── rooms.controller.js
│   │   ├── bookings.controller.js
│   │   └── users.controller.js
│   ├── middleware/
│   │   └── auth.middleware.js
│   ├── routes/
│   │   └── index.js
│   └── app.js               # Entry point
├── .env.example
├── railway.json
└── package.json
```

---

## Concurrency Handling

Sistem menggunakan 2 lapis perlindungan untuk mencegah double booking:

1. **Application Level**: `SELECT FOR UPDATE` dalam database transaction
2. **Database Level**: PostgreSQL `EXCLUDE` constraint dengan `tstzrange`

Bahkan jika 2 request datang bersamaan di milidetik yang sama, salah satunya akan ditolak oleh constraint di level database.
