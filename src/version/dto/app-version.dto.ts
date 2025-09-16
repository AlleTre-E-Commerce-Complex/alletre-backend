// src/app-version/app-version.dto.ts
export class GetVersionQuery {
  platform!: 'ios' | 'android';
  currentVersion?: string; // optional, e.g. "1.2.3"
  LatestIOSVersion?: string; // optional, e.g. "1.2.3"
  LatestAndroidVersion?: string; // optional, e.g. "1.2.3"
  AndroidAppUpdateURL?: string;
  IOSAppUpdateURL?: string;
  
}
