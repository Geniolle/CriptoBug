import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { requireEnv } from "./env.js"

export function getFirebaseAdminAuth() {
  if (getApps().length === 0) {
    const projectId = requireEnv("FIREBASE_PROJECT_ID")
    const clientEmail = requireEnv("FIREBASE_CLIENT_EMAIL")
    const privateKey = requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n")

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    })
  }
  return getAuth()
}

