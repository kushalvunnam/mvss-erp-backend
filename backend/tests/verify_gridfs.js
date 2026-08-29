const mongoose = require('mongoose');
const path = require('path');
const { uploadFile, downloadFileStream, deleteFile, fileExists } = require('../utils/gridfs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const runTest = async () => {
  console.log('Starting GridFS storage test...');
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoworkshop';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // 1. Upload mock file
    const mockBuffer = Buffer.from('Hello Persistent GridFS Storage!');
    const mockFilename = 'test_bill.txt';
    const mockContentType = 'text/plain';

    console.log('Uploading mock file...');
    const fileId = await uploadFile(mockBuffer, mockFilename, mockContentType);
    console.log(`✓ Uploaded successfully. File ID: ${fileId}`);

    // 2. Check file exists
    console.log('Verifying file exists in database...');
    const fileMeta = await fileExists(fileId);
    if (!fileMeta) throw new Error('File metadata not found in database!');
    console.log(`✓ Verified. Filename: "${fileMeta.filename}", Content-Type: "${fileMeta.contentType}", Length: ${fileMeta.length} bytes`);

    // 3. Stream download file
    console.log('Downloading file stream...');
    const downloadStream = downloadFileStream(fileId);
    const chunks = [];
    
    await new Promise((resolve, reject) => {
      downloadStream.on('data', chunk => chunks.push(chunk));
      downloadStream.on('error', err => reject(err));
      downloadStream.on('end', () => resolve());
    });

    const downloadedText = Buffer.concat(chunks).toString();
    console.log(`✓ Downloaded content: "${downloadedText}"`);
    if (downloadedText !== 'Hello Persistent GridFS Storage!') {
      throw new Error('Downloaded content does not match uploaded content!');
    }

    // 4. Delete file
    console.log('Deleting file from database...');
    await deleteFile(fileId);
    console.log('✓ File deleted.');

    // 5. Verify deleted
    const deletedMeta = await fileExists(fileId);
    if (deletedMeta) throw new Error('File still exists in database after deletion!');
    console.log('✓ Verified file is no longer present.');
    
    console.log('\n✅ GridFS Storage Helper Tests Passed!');
  } catch (err) {
    console.error('❌ Test Failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

runTest();
