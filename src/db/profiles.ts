import { and, eq, ne } from 'drizzle-orm';
import type { AppDatabase } from '@/db/connection';
import { detectionProfiles, sources } from '@/db/schema';

export type DetectionProfileValues = Omit<typeof detectionProfiles.$inferInsert, 'id' | 'name'>;

export function findSourceProfile(database: AppDatabase, sourceId: number) {
  return database
    .select({ profile: detectionProfiles })
    .from(sources)
    .innerJoin(detectionProfiles, eq(sources.profileId, detectionProfiles.id))
    .where(eq(sources.id, sourceId))
    .get()?.profile;
}

export function saveSourceProfile(
  database: AppDatabase,
  sourceId: number,
  values: DetectionProfileValues,
) {
  database.transaction((transaction) => {
    const source = transaction
      .select({ title: sources.title, profileId: sources.profileId })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .get();
    if (!source) {
      throw new Error(`Source ${sourceId} does not exist`);
    }

    const otherSourceWithSameProfile = transaction
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.profileId, source.profileId), ne(sources.id, sourceId)))
      .get();

    if (!otherSourceWithSameProfile) {
      transaction
        .update(detectionProfiles)
        .set(values)
        .where(eq(detectionProfiles.id, source.profileId))
        .run();
      return;
    }

    // A shared profile is copied so the change does not affect other sources
    const ownProfile = transaction
      .insert(detectionProfiles)
      .values({ ...values, name: `${source.title} #${sourceId}` })
      .returning({ id: detectionProfiles.id })
      .get();
    transaction
      .update(sources)
      .set({ profileId: ownProfile.id })
      .where(eq(sources.id, sourceId))
      .run();
  });
}
