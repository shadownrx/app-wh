# Project MVP — Hacé que pase

App de citas para mayores de 18. El recorrido es:

**Perfil → Match → Conversación → Propuesta → Cita → Encuentro verificado**

Slogan provisional: *Hacé que pase.*

## Carpetas

```
backend/     API Node.js (Hito 1 y núcleo del MVP)
mobile/      App iOS/Android (React Native + Expo) — siguiente hito
admin/       Panel web de administración — siguiente hito
docs/        Alcance, API y notas técnicas
```

## Backend (este entregable)

```bash
cd backend
npm install
npx prisma generate && npx prisma db push && npm run db:seed
npm test
npm run dev
```

API: `http://localhost:4000`

- Admin: `admin@hacequepase.local` / `Admin1234!`
- Usuarios: `luna@test.local` (también martin, sofia, diego, valen) / `Password123!`

Detalle: [`backend/README.md`](backend/README.md) y [`docs/api.md`](docs/api.md).
