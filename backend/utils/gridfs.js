const mongoose = require('mongoose');

let bucket;

const getBucket = () => {
  if (bucket) return bucket;
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Database connection not established.');
  }
  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'purchase_attachments'
  });
  return bucket;
};

/**
 * Uploads a buffer to GridFS
 * @param {Buffer} buffer 
 * @param {string} filename 
 * @param {string} contentType 
 * @returns {Promise<mongoose.Types.ObjectId>}
 */
const uploadFile = (buffer, filename, contentType) => {
  return new Promise((resolve, reject) => {
    try {
      const gridBucket = getBucket();
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
 * @returns {GridFSBucketReadStream}
 */
const downloadFileStream = (fileId) => {
  const gridBucket = getBucket();
  return gridBucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
};

/**
 * Deletes a file from GridFS
 * @param {string|mongoose.Types.ObjectId} fileId 
 * @returns {Promise<void>}
 */
const deleteFile = async (fileId) => {
  const gridBucket = getBucket();
  await gridBucket.delete(new mongoose.Types.ObjectId(fileId));
};

/**
 * Checks if a file exists in GridFS and returns its metadata
 * @param {string|mongoose.Types.ObjectId} fileId 
 * @returns {Promise<object|null>}
 */
const fileExists = async (fileId) => {
  try {
    const gridBucket = getBucket();
    const files = await gridBucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
    return files.length > 0 ? files[0] : null;
  } catch (err) {
    return null;
  }
};

module.exports = {
  uploadFile,
  downloadFileStream,
  deleteFile,
  fileExists
};
