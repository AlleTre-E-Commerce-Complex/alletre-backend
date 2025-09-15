// src/app-version/app-version.dto.ts
export class GetVersionQuery {
  platform!: 'ios' | 'android';
  currentVersion?: string; // optional, e.g. "1.2.3"
}
