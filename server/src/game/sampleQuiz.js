/**
 * The quiz behind "Load sample quiz". One of every question type, each with an
 * explanation, so a teacher trying the app for the first time sees everything
 * it can do without writing a word.
 */
export const sampleQuiz = {
  title: 'General Knowledge Warm-Up',
  questions: [
    {
      id: 'q1',
      type: 'multiple',
      text: 'Which planet in our solar system has the most moons?',
      timeLimitSec: 20,
      points: 1000,
      explanation:
        'Saturn overtook Jupiter in 2023 once dozens of small moons were confirmed - well over a hundred now.',
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
      explanation:
        'It is long but only a few metres wide - from the Moon that is far thinner than a human hair held at arm’s length.',
      options: [
        { id: 'true', text: 'True', correct: false },
        { id: 'false', text: 'False', correct: true },
      ],
    },
    {
      id: 'q3',
      type: 'multiselect',
      text: 'Which of these are input devices?',
      timeLimitSec: 25,
      points: 1200,
      explanation:
        'Input devices send data INTO the computer. A monitor and a printer only show you output.',
      options: [
        { id: 'a', text: 'Keyboard', correct: true },
        { id: 'b', text: 'Monitor', correct: false },
        { id: 'c', text: 'Mouse', correct: true },
        { id: 'd', text: 'Printer', correct: false },
        { id: 'e', text: 'Microphone', correct: true },
      ],
    },
    {
      id: 'q4',
      type: 'ordering',
      text: 'Put these steps of the water cycle in order, starting at the sea.',
      timeLimitSec: 30,
      points: 1200,
      explanation:
        'Water evaporates, rises and condenses into cloud, falls as precipitation, and collects to run back to the sea.',
      options: [
        { id: 'a', text: 'Evaporation' },
        { id: 'b', text: 'Condensation' },
        { id: 'c', text: 'Precipitation' },
        { id: 'd', text: 'Collection' },
      ],
    },
    {
      id: 'q5',
      type: 'numeric',
      text: 'How many bits are in one byte?',
      timeLimitSec: 20,
      points: 1000,
      answer: 8,
      tolerance: 0,
      unit: 'bits',
      explanation: 'A byte is 8 bits, which is why 2⁸ = 256 values fit in one.',
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
      explanation: 'Tokyo has been the capital since 1868, when the emperor moved there from Kyoto.',
    },
    {
      id: 'q7',
      type: 'poll',
      text: 'How confident do you feel about this topic?',
      timeLimitSec: 15,
      points: 0,
      options: [
        { id: 'a', text: 'Very confident' },
        { id: 'b', text: 'Fairly confident' },
        { id: 'c', text: 'Not sure yet' },
        { id: 'd', text: 'Lost' },
      ],
    },
  ],
};
