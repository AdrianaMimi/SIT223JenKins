import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QuestionsCard from './QuestionCard';
import { db } from '../../firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';

export default function Questions() {
    const [hovered, setHovered] = useState(false);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(
            collection(db, 'questions'),
            where('visibility', '==', 'public'),
            orderBy('votes', 'desc'),
            limit(3)
        );

        const unsub = onSnapshot(
            q,
            (snap) => {
                setRows(
                    snap.docs.map((d) => ({
                        id: d.id,
                        ...d.data(),
                        votes: d.data().votes ?? 0,
                        answersCount: d.data().answersCount ?? 0,
                    }))
                );
                setLoading(false);
            },
            (err) => {
                console.error('questions preview:', err);
                setRows([]);
                setLoading(false);
            }
        );
        return () => unsub();
    }, []);

    const preview = useMemo(() => rows, [rows]);

    return (
        <div className="lobster-regular mb-5">
            <h2 className="text-center mb-4 soft-blue">Questions</h2>

            {loading ? (
                <div className="alert alert-info">Loading…</div>
            ) : preview.length === 0 ? (
                <div className="alert alert-info">No published questions yet. Click <Link style={{ textDecoration: 'none' }} to='/post'>here</Link> to post a question</div>
            ) : (
                preview.map((item) => (
                    <QuestionsCard
                        key={item.id}
                        data={{ ...item, answersCount: item.answersCount ?? 0 }}
                    />
                ))
            )
            }

            <div className="d-flex justify-content-center mt-3">
                <Link
                    to="/questions/all"
                    className={`btn btn-rose soft-blue ${hovered ? 'shadow' : ''}`}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                >
                    See all Questions
                </Link>
            </div>
        </div >
    );
}
