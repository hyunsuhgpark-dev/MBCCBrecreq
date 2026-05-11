import * as admin from 'firebase-admin'

function getFirebaseAdmin() {
  if (admin.apps.length > 0) return admin.apps[0]!

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

export const firebaseAdmin = getFirebaseAdmin()
export const adminMessaging = admin.messaging(firebaseAdmin)
