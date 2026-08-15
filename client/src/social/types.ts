export interface StoryPublisher {
  id: string;
  name: string;
  avatar: string;
  verified?: boolean;
  subtitle?: string;
  official?: boolean;
}

export interface StoryMedia {
  type: 'image' | 'video';
  url: string;
}

export interface StoryCta {
  label: string;
  action: string;
  targetId?: string;
}

export interface Story {
  id: string;
  publisher: StoryPublisher;
  media: StoryMedia;
  mediaList?: StoryMedia[];
  caption?: string;
  cta?: StoryCta;
  createdAt: string;
  expiresAt: string;
  seen: boolean;
}

export interface StoryPost {
  id: string;
  publisher: StoryPublisher;
  type: 'image' | 'video' | 'carousel';
  media: StoryMedia[];
  caption?: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  likedByCurrentUser: boolean;
  cta?: StoryCta;
  createdAt: string;
}

export interface StoryComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}
