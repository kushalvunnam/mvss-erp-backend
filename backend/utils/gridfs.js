const mongoose = require('mongoose');

const buckets = {};

const getBucket = (bucketName = 'purchase_attachments') => {
  if (buckets[bucketName]) return buckets[bucketName];
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Database connection not established.');
  }
  buckets[bucketName] = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName
  });
  return buckets[bucketName];
};

/**
 * Uploads a buffer to GridFS
 * @param {Buffer} buffer 
 * @param {string} filename 
 * @param {string} contentType 
 * @param {string} [bucketName]
 * @returns {Promise<mongoose.Types.ObjectId>}
 */
const uploadFile = (buffer, filename, contentType, bucketName = 'purchase_attachments') => {
  return new Promise((resolve, reject) => {
    try {
      const gridBucket = getBucket(bucketName);
      const uploadStream = gridBucket.openUploadStream(filename, {
        contentType: contentType
      });
      
      uploadStream.on('error', (err) => reject(err));
      uploadStream.on('finish', () => {
        resolve(uploadStream.id);
      });
      
      uploadStream.end(buffer);
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Streams a file from GridFS
 * @param {string|mongoose.Types.ObjectId} fileId 
 * @param {string} [bucketName]
 * @returns {GridFSBucketReadStream}
 */
const downloadFileStream = (fileId, bucketName = 'purchase_attachments') => {
  const gridBucket = getBucket(bucketName);
  return gridBucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
};

/**
 * Deletes a file from GridFS
 * @param {string|mongoose.Types.ObjectId} fileId 
 * @param {string} [bucketName]
 * @returns {Promise<void>}
 */
const deleteFile = async (fileId, bucketName = 'purchase_attachments') => {
  const gridBucket = getBucket(bucketName);
  await gridBucket.delete(new mongoose.Types.ObjectId(fileId));
};

/**
 * Checks if a file exists in GridFS and returns its metadata
 * @param {string|mongoose.Types.ObjectId} fileId 
 * @param {string} [bucketName]
 * @returns {Promise<object|null>}
 */
const fileExists = async (fileId, bucketName = 'purchase_attachments') => {
  try {
    const gridBucket = getBucket(bucketName);
    const files = await gridBucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
    return files.length > 0 ? files[0] : null;
  } catch (err) {
    return null;
  }
};

/**
 * Dedicated Job Card Photo helpers for persistent storage in MongoDB GridFS
 */
const uploadPhotoFile = (buffer, filename, contentType) => {
  return uploadFile(buffer, filename, contentType, 'jobcard_photos');
};

const downloadPhotoStream = (fileId) => {
  return downloadFileStream(fileId, 'jobcard_photos');
};

const deletePhotoFile = (fileId) => {
  return deleteFile(fileId, 'jobcard_photos');
};

const photoExists = async (fileId) => {
  let meta = await fileExists(fileId, 'jobcard_photos');
  if (!meta) {
    // Fallback check purchase_attachments in case of legacy placement
    meta = await fileExists(fileId, 'purchase_attachments');
  }
  return meta;
};

module.exports = {
  getBucket,
  uploadFile,
  downloadFileStream,
  deleteFile,
  fileExists,
  uploadPhotoFile,
  downloadPhotoStream,
  deletePhotoFile,
  photoExists
};
