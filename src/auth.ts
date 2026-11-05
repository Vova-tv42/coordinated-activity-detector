import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowedAdminEmail } from '@/lib/admin-access';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    signIn({ profile }) {
      const isVerifiedEmail = profile?.email_verified === true;

      return isVerifiedEmail && isAllowedAdminEmail(profile?.email);
    },
  },
});
