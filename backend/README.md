# Backend

API del MVP. Cada dominio vive en su carpeta:

```
src/
  config/          entorno y valores por defecto
  lib/             prisma, geo, wallet, tokens, analytics
  middleware/      auth JWT, validación, errores
  http/            montaje de rutas
  jobs/            matches inactivos
  realtime/        Socket.io (chat)
  modules/
    auth/          registro, login, +18, email, baja
    profiles/      perfil, fotos, ubicación, notificaciones
    discovery/     feed, swipe, persona del día
    matches/       conexiones y chat
    dates/         propuestas, QR, confirmación
    economy/       moneda y tienda
    moderation/    bloquear y reportar
    admin/         usuarios, reportes, config, métricas
prisma/            esquema y seed
tests/             auth y flujo completo
```

Cada módulo tiene `routes.ts` (HTTP) y `schema.ts` (validación).

```bash
npm install
npx prisma generate && npx prisma db push && npm run db:seed
npm run dev
npm test
```
