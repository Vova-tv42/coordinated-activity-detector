'use client';

import { useActionState } from 'react';
import { type AddAdminFormState, addAdminAction } from '@/app/(admin)/admins/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initialState: AddAdminFormState = {};

export function AddAdminForm() {
  const [state, formAction, isPending] = useActionState(addAdminAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="admin-email">Email нового адміністратора</Label>
      <div className="flex gap-2">
        <Input
          id="admin-email"
          name="email"
          type="email"
          placeholder="name@gmail.com"
          defaultValue={state.email}
          aria-invalid={Boolean(state.error)}
          required
        />
        <Button type="submit" disabled={isPending}>
          Додати
        </Button>
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
