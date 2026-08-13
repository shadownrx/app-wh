# API

Base: `http://localhost:4000`

Auth: header `Authorization: Bearer <accessToken>` salvo donde dice “no”.

| Método | Ruta | Auth |
| --- | --- | --- |
| GET | `/health` | no |
| GET | `/api/meta` | no |
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
| GET | `/api/wallet` | sí |
| GET | `/api/shop` | sí |
| POST | `/api/shop/purchase` | sí |
| POST | `/api/users/:id/block` | sí |
| POST | `/api/users/:id/report` | sí |
| GET | `/api/admin/analytics` | admin |
| GET/PATCH | `/api/admin/config` | admin |

La ubicación pública se muestra como `A 4 km` o `La Plata`. Nunca coordenadas.

Recompensa de cita verificada: QR válido + confirmación de ambos. No alcanza con “sí, nos vimos”.
