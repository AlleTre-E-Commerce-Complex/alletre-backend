import { Injectable } from '@nestjs/common';

//Import firebase classes
import { FirebaseApp, FirebaseBucket } from './firebase.config';

@Injectable()
export class FirebaseService {
  constructor() {}

  async verifyIdToken(idToken: string) {
    try {
      await FirebaseApp.auth().verifyIdToken(idToken);
    } catch (error) {
      console.log(error);
      return 'ERROR';
    }
    return 'SUCCESS';
  }
}
