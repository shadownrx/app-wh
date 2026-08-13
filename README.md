# Hacé que pase

Aplicación de citas para mayores de 18 años. El recorrido del producto es:

**Perfil → Match → Conversación → Propuesta → Cita → Encuentro verificado**

Slogan provisional: *Hacé que pase.*

Este repositorio arranca por el **backend del MVP** (Hito 1 y núcleo de los hitos siguientes). La app móvil (React Native + Expo) y el panel web de admin se agregan a continuación, consumiendo esta API.

## Estructura

```
backend/     API Node.js + Prisma (auth, discovery, matches, chat, citas, QR, moneda, admin)
src/          Frontend web previo del repo (no es la app de citas)
```

## Backend

Ver [`backend/README.md`](backend/README.md).

```bash
cd backend
npm install
npx prisma generate && npx prisma db push && npm run db:seed
npm run dev
```

## Alcance de este entregable

Implementado en API:

- Autenticación, +18, verificación de email, recuperación de clave, baja de cuenta
- Perfiles, fotos, preferencias, distancia aproximada
- Descubrimiento con límite diario configurable, like/pass, match
- Chat, propuesta de cita, QR de un solo uso, confirmación mutua
- Moneda + historial + tienda (Deshacer pass, Perfiles extra, Super invitación, Boost, Reactivar match, Ver likes)
- Persona del día, bloquear/reportar
- Admin: usuarios, reportes, economía, configuración sin publicar la app, funnel y Match-to-Date Rate

Pendiente (siguientes hitos, misma API):

- App iOS/Android con Expo
- Panel admin web
- Push nativas (FCM/APNs) — hoy se registran tokens y eventos
- PostgreSQL + object storage de producción
