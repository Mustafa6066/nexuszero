import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    accessToken?: string;
    tenantId?: string;
    role?: string;
  }

  interface Session {
    accessToken?: string;
    tenantId?: string;
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    tenantId?: string;
    role?: string;
  }
}
