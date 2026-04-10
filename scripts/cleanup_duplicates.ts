import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupDuplicates() {
  console.log("Starting duplicate cleanup based on slugs...");
  const entities = await prisma.entity.findMany();

  // Create mapping of normalized slug -> array of entity IDs
  const slugMap = new Map<string, string[]>();
  
  for (const entity of entities) {
    const slug = entity.name.toLowerCase().trim().replace(/\s+/g, '-');
    if (!slugMap.has(slug)) slugMap.set(slug, []);
    slugMap.get(slug)?.push(entity.id);
  }

  let purgedCount = 0;

  for (const [slug, ids] of slugMap.entries()) {
    if (ids.length > 1) {
      console.log(`Duplicate found for node slug: ${slug} -> IDs:`, ids);
      
      // Keep the first ID, delete the rest
      const [masterId, ...duplicates] = ids;
      
      for (const duplicateId of duplicates) {
        // Find if they have any EventEntity mappings and attach them to Master before deleting if necessary.
        // For our pipeline we just unify them by deleting the orphans since we only have identical copies in testing so far.
        await prisma.eventEntity.updateMany({
           where: { entityId: duplicateId },
           data: { entityId: masterId }
        }).catch(err => console.log(`Constraint pass handled for ${duplicateId}`)); // Handle unique composite constraint

        await prisma.entity.delete({
          where: { id: duplicateId }
        });
        purgedCount++;
      }
    }
  }

  console.log(`Database scrub finish. Items purged: ${purgedCount}`);
}

cleanupDuplicates().finally(async () => {
  await prisma.$disconnect();
});
