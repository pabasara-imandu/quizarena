export const sampleQuiz = {
  title: 'General Knowledge Warm-Up',
  questions: [
    {
      id: 'q1',
      type: 'multiple',
      text: 'Which planet in our solar system has the most moons?',
      timeLimitSec: 20,
      points: 1000,
      options: [
        { id: 'a', text: 'Jupiter', correct: false },
        { id: 'b', text: 'Saturn', correct: true },
        { id: 'c', text: 'Neptune', correct: false },
        { id: 'd', text: 'Uranus', correct: false },
      ],
    },
    {
      id: 'q2',
      type: 'truefalse',
      text: 'The Great Wall of China is visible to the naked eye from the Moon.',
      timeLimitSec: 15,
      points: 800,
      options: [
        { id: 'true', text: 'True', correct: false },
        { id: 'false', text: 'False', correct: true },
      ],
    },
    {
      id: 'q3',
      type: 'multiple',
      text: 'What does the "HTTP" in a web address stand for?',
      timeLimitSec: 25,
      points: 1000,
      options: [
        { id: 'a', text: 'HyperText Transfer Protocol', correct: true },
        { id: 'b', text: 'High Traffic Transport Path', correct: false },
        { id: 'c', text: 'Hyperlink Text Transmission Process', correct: false },
        { id: 'd', text: 'Host Transfer Type Protocol', correct: false },
      ],
    },
    {
      id: 'q4',
      type: 'multiple',
      text: 'Which data structure works on a Last In, First Out principle?',
      timeLimitSec: 20,
      points: 1200,
      options: [
        { id: 'a', text: 'Queue', correct: false },
        { id: 'b', text: 'Stack', correct: true },
        { id: 'c', text: 'Linked list', correct: false },
        { id: 'd', text: 'Binary tree', correct: false },
      ],
    },
    {
      id: 'q5',
      type: 'truefalse',
      text: 'WebSockets keep a single connection open for two-way communication.',
      timeLimitSec: 15,
      points: 800,
      options: [
        { id: 'true', text: 'True', correct: true },
        { id: 'false', text: 'False', correct: false },
      ],
    },
    {
      id: 'q6',
      type: 'short',
      text: 'What is the capital city of Japan?',
      timeLimitSec: 30,
      points: 1200,
      // Several accepted spellings, because a student should not lose a mark to
      // a macron they cannot type on a school keyboard.
      acceptedAnswers: ['Tokyo', 'Tokio', 'Tōkyō'],
      caseSensitive: false,
    },
  ],
};
