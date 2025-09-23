export const seed = [
    {
        id: '1',
        title: 'Is there an easier way to install Google Analytics?',
        description: 'GA4 vs tag manager – best practices?',
        tags: ['analytics', 'ga4', 'tracking'],
        createdAt: '2025-08-24',
        views: 12,
        author: 'admin',
        timeAgo: '4 hours ago',
        votes: 3,
        status: 'open',
        visibility: 'public',
        answers: [
            {
                id: 'a1',
                author: 'seo_guru',
                timeAgo: '3 hours ago',
                votes: 2,
                text: 'Google Tag Manager makes it easier to maintain and add new tags without editing code.',
                isAccepted: false,
            },
            {
                id: 'a2',
                author: 'frontend_dev',
                timeAgo: '2 hours ago',
                votes: 5, // higher than a1 to test votes-desc sorting (no accepted)
                text: 'If your site is simple, you can paste GA4 directly. GTM is better if you expect to add more marketing scripts.',
                isAccepted: false,
            },
        ],
    },
    {
        id: '2',
        title: 'Recommend a good page builder plugin?',
        description: 'Lightweight builder that won’t hurt CWV.',
        tags: ['wordpress', 'plugins', 'performance'],
        createdAt: '2025-08-20',
        views: 7,
        author: 'admin',
        timeAgo: 'yesterday',
        votes: 1,
        status: 'answered',
        visibility: 'public',
        answers: [
            {
                id: 'a3',
                author: 'wp_pro',
                timeAgo: '22 hours ago',
                votes: 1,
                text: 'GenerateBlocks is lightweight and integrates with Gutenberg really well.',
                isAccepted: true, // accepted with fewer votes…
            },
            {
                id: 'a4',
                author: 'perf_nut',
                timeAgo: '20 hours ago',
                votes: 6, // …than this one, to verify "accepted pinned first"
                text: 'Avoid Elementor if you care about speed. Try Oxygen or Bricks instead.',
                isAccepted: false,
            },
            {
                id: 'a6',
                author: 'blocks_enjoyer',
                timeAgo: '18 hours ago',
                votes: 3,
                text: 'Stackable + native blocks can go a long way without a heavy builder.',
                isAccepted: false,
            },
        ],
    },
    {
        id: '3',
        title: 'Fix ERR_CONNECTION_REFUSED on Nginx?',
        description: 'Ubuntu + Nginx – what to check first?',
        tags: ['nginx', 'ubuntu', 'networking'],
        createdAt: '2025-08-18',
        views: 25,
        author: 'admin',
        timeAgo: '2 days ago',
        votes: 5,
        status: 'open',
        visibility: 'draft', // <- draft on purpose for “Published only” testing
        answers: [
            {
                id: 'a5',
                author: 'sysadmin',
                timeAgo: '1 day ago',
                votes: 4,
                text: 'Check if Nginx is actually running: `systemctl status nginx`. Also confirm port 80/443 is open in ufw.',
                isAccepted: false,
            },
        ],
    },
    {
        id: '4',
        title: 'CORS error when calling my API from the browser',
        description: 'Getting CORS policy errors. What headers should I set?',
        tags: ['cors', 'api', 'headers'],
        createdAt: '2025-08-19',
        views: 3,
        author: 'admin',
        timeAgo: 'today',
        votes: 0,
        status: 'open',
        visibility: 'public',
        answers: [], // no answers = good to test empty state
    },
];

// Build larger list and normalize counts
export const bigList = Array.from({ length: 30 }, (_, i) => {
    const base = seed[i % seed.length];
    const clonedAnswers = Array.isArray(base.answers) ? base.answers.map((a) => ({ ...a })) : [];

    // Sprinkle a few drafts through the big list so the filter is obvious
    const autoDraft = ((i + 1) % 7 === 0); // every 7th item is draft
    const visibility = base.visibility === 'draft' || autoDraft ? 'draft' : 'public';
    const isPublished = visibility === 'public';

    return {
        ...base,
        id: `q_${i + 1}`,
        title: `${base.title} (#${i + 1})`,
        createdAt: new Date(Date.parse(base.createdAt) - i * 86400000)
            .toISOString()
            .slice(0, 10),
        answers: clonedAnswers,
        answersCount: clonedAnswers.length,
        visibility,
        isPublished,
    };
});

// Small helper so components can stay tidy
export const isPublishedItem = (item) =>
    item?.isPublished ?? (item?.visibility ? item.visibility === 'public' : true);
