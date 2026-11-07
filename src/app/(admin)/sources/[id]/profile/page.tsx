import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDatabase } from '@/db/connection';
import { type DetectionProfileValues, findSourceProfile, saveSourceProfile } from '@/db/profiles';
import { findSource } from '@/db/sources';

type ProfileField = {
  name: keyof DetectionProfileValues;
  label: string;
  min: number;
  max?: number;
  step: number;
};

const SHARE_STEP = 0.01;

const profileFields: ProfileField[] = [
  { name: 'syncGapSec', label: 'Δ - синхронний проміжок, с', min: 1, step: 1 },
  { name: 'windowMinutes', label: 'T - тривалість вікна, хв', min: 1, step: 1 },
  { name: 'windowMaxMessages', label: 'Максимум повідомлень у вікні', min: 1, step: 1 },
  { name: 'minTextLength', label: 'Мінімальна довжина тексту', min: 0, step: 1 },
  { name: 'simThreshold', label: 'Поріг текстової схожості', min: 0, max: 1, step: SHARE_STEP },
  { name: 'wText', label: 'Вага текстової схожості', min: 0, max: 1, step: SHARE_STEP },
  { name: 'wCoactivity', label: 'Вага синхронної активності', min: 0, max: 1, step: SHARE_STEP },
  { name: 'wCosharing', label: 'Вага спільних посилань', min: 0, max: 1, step: SHARE_STEP },
  { name: 'edgeThreshold', label: 'Поріг ребра графа', min: 0, max: 1, step: SHARE_STEP },
  { name: 'keepThreshold', label: 'Поріг збереження пари', min: 0, max: 1, step: SHARE_STEP },
];

function parseProfileForm(formData: FormData) {
  const entries = profileFields.map((field) => {
    const value = Number(formData.get(field.name));
    const isWithinLimits =
      Number.isFinite(value) && value >= field.min && value <= (field.max ?? Infinity);
    if (!isWithinLimits) {
      throw new Error(`Invalid value for ${field.name}`);
    }
    return [field.name, value];
  });
  return Object.fromEntries(entries) as DetectionProfileValues;
}

function parseSourceId(id: string) {
  const isSourceIdNumber = /^[1-9]\d*$/.test(id);
  if (!isSourceIdNumber) {
    notFound();
  }
  return Number(id);
}

async function ProfileForm({ params }: Pick<PageProps<'/sources/[id]/profile'>, 'params'>) {
  const sourceId = parseSourceId((await params).id);
  const database = getDatabase();
  const source = findSource(database, sourceId);
  const profile = findSourceProfile(database, sourceId);
  if (!source || !profile) {
    notFound();
  }

  async function saveProfile(formData: FormData) {
    'use server';
    saveSourceProfile(getDatabase(), sourceId, parseProfileForm(formData));
    redirect(`/sources/${sourceId}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Параметри аналізу</CardTitle>
        <CardDescription>
          {source.title} - профіль «{profile.name}»
        </CardDescription>
      </CardHeader>
      <form action={saveProfile} className="flex flex-col gap-6">
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {profileFields.map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                name={field.name}
                type="number"
                required
                min={field.min}
                max={field.max}
                step={field.step}
                defaultValue={profile[field.name]}
              />
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button type="submit">Зберегти</Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function SourceProfilePage({ params }: PageProps<'/sources/[id]/profile'>) {
  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" className="self-start" asChild>
        <Link href="/">До списку джерел</Link>
      </Button>
      <Suspense fallback={<p className="text-muted-foreground">Завантаження...</p>}>
        <ProfileForm params={params} />
      </Suspense>
    </div>
  );
}
