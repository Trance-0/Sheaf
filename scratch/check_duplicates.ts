import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const entities = await prisma.entity.groupBy({
    by: ['name'],
    _count: {
      name: true,
    },
    having: {
      name: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  console.log('Duplicated Entities by Name:', entities);

  const ids = await prisma.entity.findMany();
  console.log('All Entities:', ids.map(i => ({id: i.id, name: i.name})));
}

check().finally(() => prisma.$disconnect());
