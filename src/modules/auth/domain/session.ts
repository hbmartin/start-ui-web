export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null | undefined;
  role?: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
  onboardedAt?: Date | null | undefined;
};

export type AuthenticatedSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
  token: string;
};

export type Session = {
  user: AuthenticatedUser;
  session: AuthenticatedSession;
};
