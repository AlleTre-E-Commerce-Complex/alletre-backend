import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

//Import firebase classes
import { FirebaseApp, FirebaseBucket } from './firebase.config';
import { MethodNotAllowedResponse } from 'src/common/errors';
import { unlink } from 'fs/promises';

@Injectable()
export class FirebaseService {
  constructor() {}

  async uploadImage(image: Express.Multer.File, prefix = 'uploadedImage') {
    const fileId = uuidv4();
    const metadata = {
      // used to create a download token
      metadata: { firebaseStorageDownloadTokens: fileId },
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    };
    const filePath = `${prefix}-${fileId}`;

    let data: any;
    try {
      data = await FirebaseBucket.upload(`uploads/${image.filename}`, {
        // Support for HTTP requests made with `Accept-Encoding: gzip`
        gzip: true,
        metadata: metadata,
        destination: filePath,
      });
    } catch {
      throw new MethodNotAllowedResponse({
        ar: 'خطأ داخلى فى رفع الصور، برجاء إعادة المحاولة',
        en: 'Error uploading images to the cloud, please try again.',
      });
    }

    await unlink(`${process.cwd()}/uploads/${image.filename}`).catch(
      (error) => {
        console.log(error);
      },
    );

    return {
      fileName: image.originalname,
      fileLink: this.getDownloadLink(data[0], fileId),
      size: data[0].metadata.size,
      fileId: fileId,
      filePath: filePath,
    };
  }

  getDownloadLink(file: File, downloadToken: string) {
    return (
      'https://firebasestorage.googleapis.com/v0/b/' +
      FirebaseBucket.name +
      '/o/' +
      encodeURIComponent(file.name) +
      '?alt=media&token=' +
      downloadToken
    );
  }

  async deleteFileFromStorage(filePath: string) {
    try {
      await FirebaseBucket.file(filePath).delete();
    } catch (error) {
      console.error(error);
    }
  }

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
