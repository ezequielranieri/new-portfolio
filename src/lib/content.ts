import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const CONTENT_DIR = path.resolve('./src/content');

export interface BlogPost {
  slug: string;
  data: {
    title: string;
    description: string;
    date: Date;
    updatedDate?: Date;
    tags: string[];
    draft: boolean;
    lang: 'es' | 'en';
  };
  body: string;
}

export interface Project {
  slug: string;
  data: {
    title: string;
    description: string;
    fullDescription?: string;
    problem: string;
    decisions: string[];
    stack: string[];
    tradeoffs: string[];
    links?: {
      github?: string;
      demo?: string;
      article?: string;
    };
    featured: boolean;
    order: number;
    lang: 'es' | 'en';
  };
  body: string;
}

function readContentFiles<T>(subdir: string, lang: 'es' | 'en'): T[] {
  const dir = path.join(CONTENT_DIR, subdir, lang);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
  const results: T[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    const slug = file.replace(/\.mdx?$/, '');
    
    // Convert date strings to Date objects
    if (data.date && typeof data.date === 'string') {
      data.date = new Date(data.date);
    }
    if (data.updatedDate && typeof data.updatedDate === 'string') {
      data.updatedDate = new Date(data.updatedDate);
    }

    results.push({
      slug,
      data: data as any,
      body,
    } as T);
  }

  return results;
}

export function getBlogPosts(lang: 'es' | 'en'): BlogPost[] {
  return readContentFiles<BlogPost>('blog', lang)
    .filter(post => !post.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function getBlogPost(slug: string, lang: 'es' | 'en'): BlogPost | null {
  const posts = readContentFiles<BlogPost>('blog', lang);
  return posts.find(p => p.slug === slug) || null;
}

export function getProjects(lang: 'es' | 'en'): Project[] {
  return readContentFiles<Project>('projects', lang)
    .sort((a, b) => a.data.order - b.data.order);
}

export function getFeaturedProjects(lang: 'es' | 'en'): Project[] {
  return getProjects(lang).filter(p => p.data.featured);
}

export function getOtherProjects(lang: 'es' | 'en'): Project[] {
  return getProjects(lang).filter(p => !p.data.featured);
}