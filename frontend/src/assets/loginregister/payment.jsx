import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { auth } from '../../firebase';

const CHECKOUT_URL = import.meta.env.VITE_FN_CHECKOUT; 

export default function PaymentPage() {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    const startCheckout = async () => {
        try {
            setErr('');
            setLoading(true);

            const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
            if (!pk) throw new Error('Missing VITE_STRIPE_PUBLISHABLE_KEY');

            const stripe = await loadStripe(pk);
            if (!stripe) throw new Error('Stripe failed to load');

            const user = auth.currentUser;
            if (!user) throw new Error('Please sign in first');

            const idToken = await user.getIdToken(true);

            const res = await fetch(CHECKOUT_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { id, url } = await res.json();

            if (id) {
                const { error } = await stripe.redirectToCheckout({ sessionId: id });
                if (error) throw error;
            } else if (url) {
                window.location.href = url;
            } else {
                throw new Error('No session returned from server');
            }
        } catch (e) {
            setErr(e.message || 'Checkout failed');
            setLoading(false);
        }
    };

    return (
        <div className="container py-5 lobster-regular">
            <h3 className="mb-3">Upgrade to Premium</h3>
            <p className="text-muted mb-4">You’ll be redirected to Stripe to complete your subscription.</p>
            {err && <div className="alert alert-danger">{err}</div>}
            <button className="btn btn-primary" onClick={startCheckout} disabled={loading}>
                {loading ? 'Redirecting…' : 'Go to Checkout'}
            </button>
            <div className="small text-muted mt-3">
                Test card: 4242 4242 4242 4242 · any future date · any CVC
            </div>
        </div>
    );
}
