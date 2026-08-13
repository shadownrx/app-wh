import { prisma } from "./prisma";
import { DEFAULT_SETTINGS } from "../config/constants";

const SHOP_ITEMS = [
  { key: "UNDO_PASS", name: "Deshacer pass", description: "Recuperá el último perfil que pasaste.", price: 8, sortOrder: 1 },
  { key: "EXTRA_PROFILES", name: "Perfiles extra", description: "Desbloqueá más perfiles después del límite diario.", price: 12, sortOrder: 2 },
  { key: "SUPER_INVITE", name: "Super invitación", description: "Destacá un interés enviado.", price: 20, sortOrder: 3 },
  { key: "BOOST", name: "Boost", description: "Mayor exposición temporal.", price: 40, sortOrder: 4 },
  { key: "REACTIVATE_MATCH", name: "Reactivar match", description: "Recuperá un match inactivo.", price: 15, sortOrder: 5 },
  { key: "SEE_LIKES", name: "Ver likes", description: "Mirá quién mostró interés.", price: 25, sortOrder: 6 },
  { key: "PREMIUM_FILTERS", name: "Filtros premium", description: "Acceso temporal a filtros extra.", price: 18, sortOrder: 7 },
  { key: "PREMIUM_24H", name: "Premium 24h", description: "Beneficios premium por un día.", price: 50, sortOrder: 8 },
];

export async function bootstrapCatalog() {
  await prisma.appSetting.upsert({
    where: { key: "app" },
    update: {},
    create: { key: "app", value: JSON.stringify(DEFAULT_SETTINGS) },
  });
  for (const item of SHOP_ITEMS) {
    await prisma.shopItem.upsert({
      where: { key: item.key },
      update: { name: item.name, description: item.description, price: item.price, enabled: true, sortOrder: item.sortOrder },
      create: item,
    });
  }
}
