export type CategoryId =
  | 'result'
  | 'scene'
  | 'action'
  | 'gesticulation'
  | 'camera'
  | 'lens'
  | 'lighting'
  | 'realism'
  | 'outfit'
  | 'makeup'
  | 'color'
  | 'props'
  | 'intention'
  | 'negative'
  | 'exposed_body'
  | 'focus'
  | 'movement'
  | 'environment'
  | 'body_details'
  | string;

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  color?: string;
}

export interface Block {
  id: string;
  categoryId: CategoryId;
  label: string;
  value: string;
  isCustom?: boolean;
  isFavorite?: boolean;
  isNsfw?: boolean;
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  icon: string;
  blockIds: string[];
  isNsfw?: boolean;
}

export interface CustomCategory {
  id: string;
  parentId: string | null;
  name: string;
  authorId?: string;
  icon?: string;
  color?: string;
}

export interface CustomBlock extends Block {
  title: string;
  promptText: string;
  authorId?: string;
}

export type WorkMode = 'prompting' | 'influencer' | 'recreation' | 'variations' | 'flow' | 'community' | 'product' | 'profiles' | 'admin' | 'profile' | 'coworking' | 'alquimia';

export type Language = 'es' | 'en';

export type SubscriptionTier = 'free' | 'pro' | 'elite';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  hashtag: string; // 4-character unique identifier
  photoURL: string;
  isAdmin: boolean;
  freePromptsUsed: number;
  isSubscribed: boolean;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiry?: number;
}

export interface CoworkingMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderHashtag: string;
  content: string;
  timestamp: number;
  type: 'text' | 'file' | 'image';
  fileUrl?: string;
  fileName?: string;
}

export interface CoworkingTopic {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  members: string[]; // List of user UIDs
  messages: CoworkingMessage[];
  createdAt: number;
  lastMessageAt: number;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  date: number;
  isPublished: boolean;
  type?: 'update' | 'feature' | 'announcement';
  authorId?: string;
}

export interface SavedPrompt {
  id: string;
  title: string;
  prompt: string;
  authorId: string;
  createdAt: number;
}

export interface PromptSession {
  id: string;
  title?: string;
  date: number;
  mode: WorkMode;
  selectedBlocks: string | Block[];
  customInstructions: string[];
  compiledPrompt: string;
  isFavorite: boolean;
  likes?: number;
  authorId?: string;
  authorName?: string;
  isPublic?: boolean;
}

