'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import type { UploadResponseBody } from '@/app/api/upload/route';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const UNEXPECTED_ERROR_MESSAGE = 'Не вдалося завантажити файл. Спробуйте ще раз.';

type UploadChatLogFormProps = {
  profiles: { id: number; name: string }[];
};

async function uploadChatLog(formData: FormData): Promise<UploadResponseBody> {
  try {
    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    return await response.json();
  } catch {
    return { errors: [UNEXPECTED_ERROR_MESSAGE] };
  }
}

export function UploadChatLogForm({ profiles }: UploadChatLogFormProps) {
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await uploadChatLog(formData);
      if ('errors' in result) {
        setErrors(result.errors);
        return;
      }
      router.push(`/sources/${result.sourceId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="chat-log-file">Файл з логом</Label>
          <Input
            id="chat-log-file"
            name="file"
            type="file"
            accept=".json,application/json"
            aria-invalid={errors.length > 0}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="chat-log-profile">Профіль аналізу</Label>
          <Select name="profileId" defaultValue={String(profiles[0]?.id)} required>
            <SelectTrigger id="chat-log-profile" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={String(profile.id)}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Файл не прийнято</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Завантаження...' : 'Завантажити'}
        </Button>
      </div>
    </form>
  );
}
