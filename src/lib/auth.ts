import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import { db } from "@/lib/db"
import { ipFrom, isLockedOut, recordAttempt } from "@/lib/login-guard"

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        // Same lockout as the staff-side gates (src/lib/login-guard.ts).
        const h = (req?.headers ?? {}) as Record<string, string | string[] | undefined>
        const ip = ipFrom({ get: (n) => { const v = h[n]; return Array.isArray(v) ? v[0] : v } })
        if (await isLockedOut("admin", ip)) return null

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) { await recordAttempt("admin", ip, false); return null }

        const isValid = await compare(credentials.password, user.hashedPassword)
        await recordAttempt("admin", ip, isValid)
        if (!isValid) return null

        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string
      }
      return session
    },
  },
}
