export type Page = "home" | "code" | "study" | "rooms" | "admin";
export type CodeLanguage = "Python" | "JavaScript" | "C++" | "Rust";

export interface Flashcard {
  question: string;
  answer: string;
}

export interface ChatMessage {
  id: number | string;
  name: string;
  text: string;
  time: string;
  createdAt?: Date;
  isAI?: boolean;
  authorId?: string;
}
