# Hacé que pase — API

Backend del MVP de la app de citas. El producto premia que un match se convierta en un encuentro real (Match-to-Date Rate), no el swipe infinito.

## Stack

- Node.js 20+ / Express / TypeScript
- Prisma + SQLite (se puede cambiar a PostgreSQL sin rehacer el modelo)
- JWT (access + refresh)
- Socket.io para chat en tiempo real
- Fotos en disco (`/uploads`), listo para reemplazar por S3
- Configuración operativa editable desde admin (límites, recompensas, precios, nombre de “Proponer cita”)

## Cómo correrlo

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

API: `http://localhost:4000`

Cuentas de seed:

- Admin: `admin@hacequepase.local` / `Admin1234!`
- Usuarios: `luna@test.local`, `martin@test.local`, `sofia@test.local`, `diego@test.local`, `valen@test.local` / `Password123!`

```bash
npm test
```

## Qué incluye este backend (MVP)

1. Registro / login / logout / refresh
2. Solo +18 (bloquea menores)
3. Verificar email y recuperar contraseña
4. Aceptar términos y borrar cuenta
5. Perfil, preferencias, fotos (hasta 6) y ubicación aproximada (nunca se expone en público)
6. Descubrimiento con like / pass y límite diario configurable (30)
7. Match, estados de conexión y matches inactivos (48 h)
8. Chat de texto + Socket.io
9. Proponer / aceptar / contraofertar / rechazar / cancelar cita
10. QR temporal de un solo uso (90 s) + confirmación mutua
11. Moneda, historial (earned vs purchased) y tienda (8 recompensas)
12. Persona del día
13. Bloquear / reportar
14. Panel admin: usuarios, reportes, economía, config, analytics y Match-to-Date Rate
15. Funnel de analytics

Fuera de este MVP (Fase 2, preparado en el modelo): pagos reales, Premium mensual, foto conjunta obligatoria, IA, videollamadas, recompensas físicas.

## Endpoints principales

| Método | Ruta | Auth |
| --- | --- | --- |
| POST | `/api/auth/register` | no |
| POST | `/api/auth/login` | no |
| POST | `/api/auth/refresh` | no |
| POST | `/api/auth/forgot-password` | no |
| POST | `/api/auth/reset-password` | no |
| POST | `/api/auth/verify-email` | no |
| DELETE | `/api/auth/account` | sí |
| GET/PATCH | `/api/me` | sí |
| POST | `/api/me/photos` | sí |
| PATCH | `/api/me/location` | sí |
| GET | `/api/discover` | sí |
| GET | `/api/discover/person-of-the-day` | sí |
| POST | `/api/discover/swipe` | sí |
| GET | `/api/matches` | sí |
| POST | `/api/matches/:id/messages` | sí |
| POST | `/api/matches/:id/proposals` | sí |
| POST | `/api/proposals/:id/respond` | sí |
| POST | `/api/proposals/:id/qr` | sí |
| POST | `/api/check-in/scan` | sí |
| POST | `/api/proposals/:id/confirm` | sí |
| GET | `/api/wallet` `/api/wallet/history` | sí |
| GET/POST | `/api/shop` `/api/shop/purchase` | sí |
| POST | `/api/users/:id/block` `/report` | sí |
| GET | `/api/admin/analytics` `/config` `/users` `/reports` | admin |

## Economía (valores iniciales, editables en admin)

- Match +1
- Conversación significativa +3 (5 mensajes de cada uno)
- Cita aceptada +8
- Cita verificada +30 (QR + confirmación de ambos)
- Segunda cita verificada +40

La recompensa grande no se entrega con un simple “sí, nos vimos”.

## Privacidad de ubicación

El perfil público puede mostrar `A 4 km` o `La Plata`. Nunca coordenadas, domicilio ni tracking en tiempo real.
