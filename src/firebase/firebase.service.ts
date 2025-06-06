import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

//Import firebase classes
import { FirebaseApp, FirebaseBucket } from './firebase.config';
import { MethodNotAllowedResponse } from '../common/errors/MethodNotAllowedResponse';
import { unlink } from 'fs/promises';

@Injectable()
export class FirebaseService {
  constructor() {}

  async uploadImage(image: Express.Multer.File, prefix = 'uploadedImage') {
    const fileId = uuidv4();
    const isVideo = image.mimetype.startsWith('video/');

    // Use special handling for videos
    if (isVideo) {
      prefix = 'AlletreVideo';
    }

    // Extract the file extension from the original filename
    const fileExtension = image.originalname.split('.').pop(); // e.g., 'jpg' or 'png'

    const metadata = {
      metadata: { firebaseStorageDownloadTokens: fileId }, // Used to create a download token
      contentType: image.mimetype, // Use the correct MIME type from the uploaded file
      cacheControl: 'public, max-age=31536000',
    };

    // Construct the file path with the correct extension
    const timestamp = Date.now();
    const filePath = isVideo
      ? `${timestamp}-${prefix}.${fileExtension}`
      : `${prefix}-${fileId}.${fileExtension}`;

    console.log('file Path : ', filePath);

    let data: any;
    try {
      if (image.buffer) {
        // If we have a buffer, upload it directly
        data = await FirebaseBucket.file(filePath).save(image.buffer, {
          metadata: metadata,
          contentType: image.mimetype,
          gzip: !isVideo, // Don't use gzip for videos
        });

        // Get the file reference for metadata
        const file = FirebaseBucket.file(filePath);
        data = [file];
      } else if (image.filename) {
        // If we have a filename, use the upload method
        data = await FirebaseBucket.upload(`uploads/${image.filename}`, {
          gzip: !isVideo, // Don't use gzip for videos
          metadata: metadata,
          destination: filePath, // Save with the correct filename
        });
      } else {
        throw new Error('No valid file data found');
      }
    } catch (error) {
      console.error('Error code uploading to Firebase:', error.code);
      console.error('Error message uploading to Firebase:', error.message);
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
      fileLink: this.getDownloadLink(data[0], fileId), // Pass fileExtension
      size: data[0].metadata.size,
      fileId: fileId,
      filePath: filePath,
    };
  }

  async uploadPdf(pdf: Express.Multer.File, prefix = 'uploadedDocument') {
    const fileId = uuidv4();
    const metadata = {
      metadata: { firebaseStorageDownloadTokens: fileId },
      contentType: 'application/pdf', // Key change: PDF MIME type
      cacheControl: 'public, max-age=31536000',
    };
    const filePath = `${prefix}-${fileId}`;
    let data: any;
    try {
      data = await FirebaseBucket.upload(`uploads/${pdf.filename}`, {
        gzip: true,
        metadata: metadata,
        destination: filePath,
      });

      await unlink(`${process.cwd()}/uploads/${pdf.filename}`).catch((error) =>
        console.log(error),
      );
      return {
        fileName: pdf.originalname,
        fileLink: this.getDownloadLink(data[0], fileId),
        size: data[0].metadata.size,
        fileId: fileId,
        filePath: filePath,
      };
    } catch (error) {
      console.error('PDF upload error:', error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ داخلى فى رفع المستندات، برجاء إعادة المحاولة',
        en: 'Error uploading document to the cloud, please try again.',
      });
    }
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
