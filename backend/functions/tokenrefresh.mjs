import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const me = onRequest({ cors: true }, async (req, res) => {
  const hdr = req.headers.authorization || '';
  if (!hdr.startsWith('Bearer ')) return res.status(401).send('Missing token');

  try {
    const decoded = await getAuth().verifyIdToken(hdr.slice(7), true);
    const snap = await getFirestore().doc(`profiles/${decoded.uid}`).get();
    res.json({
      uid: decoded.uid,
      premium: !!decoded.premium,
      profile: snap.exists ? snap.data() : null,
    });
  } catch (e) {
    res.status(401).send('Invalid token');
  }
});