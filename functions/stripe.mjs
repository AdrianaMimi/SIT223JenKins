import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';  
import Stripe from 'stripe';

if (!getApps().length) {
  initializeApp();
}

const STRIPE_SECRET = defineSecret('STRIPE_SECRET');
const PRICE_ID = process.env.STRIPE_PRICE_ID;

function originOf(req) {
  return req.headers.origin || `https://${process.env.GCLOUD_PROJECT}.web.app`;
}

async function verifyIdToken(req) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return null;
  try {
    return await getAuth().verifyIdToken(token, true);
  } catch {
    return null;
  }
}

// POST -> { url, id }
export const createCheckoutSession = onRequest({ cors: true, secrets: [STRIPE_SECRET] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const decoded = await verifyIdToken(req);
  if (!decoded) return res.status(401).send('Unauthorized');
  if (!PRICE_ID) return res.status(500).send('Missing STRIPE_PRICE_ID');

  const stripe = new Stripe(STRIPE_SECRET.value(), { apiVersion: '2024-06-20' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      customer_email: decoded.email || undefined,
      client_reference_id: decoded.uid,
      metadata: { firebase_uid: decoded.uid },
      success_url: `${originOf(req)}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${originOf(req)}/plans`,
      allow_promotion_codes: true,
    });

    res.json({ url: session.url, id: session.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Stripe error' });
  }
});

// POST body: { session_id: string }
export const activatePremiumFromSession = onRequest({ cors: true, secrets: [STRIPE_SECRET] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const decoded = await verifyIdToken(req);
  if (!decoded) return res.status(401).send('Unauthorized');

  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  const stripe = new Stripe(STRIPE_SECRET.value(), { apiVersion: '2024-06-20' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Verify it really belongs to this user and is paid
    const uidFromMeta = session.metadata?.firebase_uid || session.client_reference_id;
    const paid = session.payment_status === 'paid';
    const isSub = session.mode === 'subscription';

    if (!paid || !isSub) return res.status(400).json({ error: 'Payment not complete' });
    if (!uidFromMeta || uidFromMeta !== decoded.uid) return res.status(403).json({ error: 'Wrong user' });

    // Set custom claim { premium: true } and revoke refresh tokens so client sees it next login/refresh
    const auth = getAuth();
    const user = await auth.getUser(decoded.uid);
    const claims = user.customClaims || {};
    await auth.setCustomUserClaims(decoded.uid, { ...claims, premium: true });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Activate error' });
  }
});
