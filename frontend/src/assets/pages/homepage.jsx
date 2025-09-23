import { useEffect, useState } from 'react';
import FeaturedArticles from "../article/ArticlesHomePage";
import FeaturedTutorials from "../tutorial/TutorialsHomePage";
import Questions from '../question/QuestionsHomePage';

function HomePage() {

  useEffect(() => {
    document.title = "🌷 Dev@Deakin";
  }, []);

  const [hovered, setHovered] = useState(false);

  return (
    <div>
      <div className="container py-4">
        <div className="text-center mb-5 rounded">
          <img
            src="./detail.jpg"
            alt="Banner"
            className={`img-fluid rounded ${hovered ? 'shadow' : 'shadow-sm'}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ transition: 'box-shadow 0.3s ease-in-out', width: '900px', height: '300px' }}
          />
        </div>
        <FeaturedArticles />
        <FeaturedTutorials />
        <Questions />

      </div>
    </div>
  );
}

export default HomePage;
