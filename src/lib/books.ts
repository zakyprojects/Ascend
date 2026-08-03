import { BookCategory, CuratedBook } from '@/types';

export interface CuratedBookCategory {
  name: BookCategory;
  color: string;
  bgClass: string;
}

export const BOOK_CATEGORIES: CuratedBookCategory[] = [
  { name: 'Habits', color: 'text-emerald-400', bgClass: 'bg-emerald-500/15 border-emerald-500/30' },
  { name: 'Mindset', color: 'text-purple-400', bgClass: 'bg-purple-500/15 border-purple-500/30' },
  { name: 'Productivity', color: 'text-blue-400', bgClass: 'bg-blue-500/15 border-blue-500/30' },
  { name: 'Discipline', color: 'text-orange-400', bgClass: 'bg-orange-500/15 border-orange-500/30' },
  { name: 'Finance', color: 'text-amber-400', bgClass: 'bg-amber-500/15 border-amber-500/30' },
  { name: 'Relationships', color: 'text-rose-400', bgClass: 'bg-rose-500/15 border-rose-500/30' },
  { name: 'Spirituality', color: 'text-teal-400', bgClass: 'bg-teal-500/15 border-teal-500/30' },
];

export function getCategoryMeta(category: BookCategory): CuratedBookCategory {
  return BOOK_CATEGORIES.find((c) => c.name === category) ?? BOOK_CATEGORIES[0];
}

export const CURATED_BOOKS: CuratedBook[] = [
  {
    id: 'curated-atomic-habits',
    title: 'Atomic Habits',
    author: 'James Clear',
    description:
      'An easy & proven way to build good habits & break bad ones. Tiny changes, remarkable results. Focus on 1% improvements every day.',
    category: 'Habits',
    isCurated: true,
    pointsOnCompletion: 40,
  },
  {
    id: 'curated-7-habits',
    title: 'The 7 Habits of Highly Effective People',
    author: 'Stephen R. Covey',
    description:
      'A principle-centered framework for personal and interpersonal effectiveness. Move from dependence to independence to interdependence.',
    category: 'Habits',
    isCurated: true,
    pointsOnCompletion: 45,
  },
  {
    id: 'curated-deep-work',
    title: 'Deep Work',
    author: 'Cal Newport',
    description:
      'Rules for focused success in a distracted world. Cultivate the ability to focus without distraction on cognitively demanding tasks.',
    category: 'Productivity',
    isCurated: true,
    pointsOnCompletion: 35,
  },
  {
    id: 'curated-power-of-now',
    title: 'The Power of Now',
    author: 'Eckhart Tolle',
    description:
      'A guide to spiritual enlightenment. Learn to transcend ego-based thinking and embrace the present moment to find peace and fulfillment.',
    category: 'Spirituality',
    isCurated: true,
    pointsOnCompletion: 30,
  },
  {
    id: 'curated-cant-hurt-me',
    title: "Can't Hurt Me",
    author: 'David Goggins',
    description:
      'Master your mind and defy the odds. A story of extreme perseverance showing how to callous your mind, overcome pain, and reach your full potential.',
    category: 'Discipline',
    isCurated: true,
    pointsOnCompletion: 50,
  },
  {
    id: 'curated-think-grow-rich',
    title: 'Think and Grow Rich',
    author: 'Napoleon Hill',
    description:
      'The classic guide to wealth-building philosophy. Thirteen proven steps toward riches and the power of organized, personal initiative.',
    category: 'Finance',
    isCurated: true,
    pointsOnCompletion: 35,
  },
  {
    id: 'curated-subtle-art',
    title: "The Subtle Art of Not Giving a F*ck",
    author: 'Mark Manson',
    description:
      'A counterintuitive approach to living a good life. Let go of what you think your life should be and embrace the messiness of reality.',
    category: 'Mindset',
    isCurated: true,
    pointsOnCompletion: 30,
  },
  {
    id: 'curated-mindset',
    title: 'Mindset: The New Psychology of Success',
    author: 'Carol S. Dweck',
    description:
      'How we can learn to fulfill our potential by adopting a growth mindset over a fixed mindset. The power of believing you can improve.',
    category: 'Mindset',
    isCurated: true,
    pointsOnCompletion: 35,
  },
  {
    id: 'curated-alchemist',
    title: 'The Alchemist',
    author: 'Paulo Coelho',
    description:
      'A mystical fable about following your dreams. A shepherd boy embarks on a journey to find his personal legend and discovers treasures within.',
    category: 'Spirituality',
    isCurated: true,
    pointsOnCompletion: 25,
  },
  {
    id: 'curated-ikigai',
    title: 'Ikigai: The Japanese Secret to a Long and Happy Life',
    author: 'Hector Garcia & Francesc Miralles',
    description:
      'Find your reason for being. The intersection of what you love, what you are good at, what the world needs, and what you can be paid for.',
    category: 'Mindset',
    isCurated: true,
    pointsOnCompletion: 25,
  },
  {
    id: 'curated-compound-effect',
    title: 'The Compound Effect',
    author: 'Darren Hardy',
    description:
      'Multiplying your success, one simple step at a time. Small, smart, consistent choices + time = radical difference between where you are and where you want to be.',
    category: 'Productivity',
    isCurated: true,
    pointsOnCompletion: 30,
  },
  {
    id: 'curated-mans-search',
    title: "Man's Search for Meaning",
    author: 'Viktor E. Frankl',
    description:
      'Lessons from a Nazi concentration camp on the importance of finding purpose and meaning in suffering, and how that drives the will to survive.',
    category: 'Spirituality',
    isCurated: true,
    pointsOnCompletion: 40,
  },
];

export function findCuratedBook(id: string): CuratedBook | undefined {
  return CURATED_BOOKS.find((b) => b.id === id);
}
