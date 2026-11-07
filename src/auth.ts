import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { hasAdminAccess } from '@/db/admins';
import { getDatabase } from '@/db/connection';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    signIn({ profile }) {
      const isVerifiedEmail = profile?.email_verified === true;

      return isVerifiedEmail && hasAdminAccess(getDatabase(), profile?.email);
    },
  },
});
