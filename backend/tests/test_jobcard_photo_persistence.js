const mongoose = require('mongoose');
const path = require('path');
const { 
  uploadPhotoFile, 
  downloadPhotoStream, 
  deletePhotoFile, 
  photoExists, 
  getBucket 
} = require('../utils/gridfs');
const JobCard = require('../models/JobCard');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const runTest = async () => {
  console.log('====================================================');
  console.log('🧪 TESTING JOBCARD PHOTO PERSISTENCE & GRIDFS BUCKET');
  console.log('====================================================\n');

  let testJobCardId = null;
  let testFileId = null;

  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoworkshop';
    console.log('[1/6] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB database successfully.\n');

    // 1. Upload mock vehicle inspection photo buffer
    const mockImageBuffer = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, // JPEG magic bytes
      0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x54, 0x45, 0x53, 0x54, 0x5F, 0x4A, 0x4F, 0x42, 0x43, 0x41, 0x52, 0x44, // "TEST_JOBCARD"
      0xFF, 0xD9
    ]);
    const originalName = 'inspection_front_bumper.jpg';
    const mimeType = 'image/jpeg';
    const photoType = 'Before Repair';

    console.log('[2/6] Uploading photo directly to persistent MongoDB GridFS bucket "jobcard_photos"...');
    testFileId = await uploadPhotoFile(mockImageBuffer, originalName, mimeType);
    console.log(`✓ Uploaded successfully. Generated GridFS File ID: ${testFileId.toString()}\n`);

    // 2. Verify file exists in jobcard_photos bucket
    console.log('[3/6] Verifying photo metadata in GridFS bucket...');
    const meta = await photoExists(testFileId);
    if (!meta) throw new Error('Photo was not found in GridFS database!');
    console.log(`✓ Metadata Verified:
      - ID: ${meta._id}
      - Filename: ${meta.filename}
      - Content-Type: ${meta.contentType}
      - File Length: ${meta.length} bytes
      - Upload Date: ${meta.uploadDate}\n`);

    if (meta.contentType !== mimeType) {
      throw new Error(`Expected contentType ${mimeType}, but got ${meta.contentType}`);
    }

    // 3. Test streaming retrieval
    console.log('[4/6] Streaming photo from GridFS to verify data integrity...');
    const stream = downloadPhotoStream(testFileId);
    const chunks = [];
    await new Promise((resolve, reject) => {
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('error', err => reject(err));
      stream.on('end', resolve);
    });

    const downloadedBuffer = Buffer.concat(chunks);
    if (!downloadedBuffer.equals(mockImageBuffer)) {
      throw new Error('Downloaded buffer does not match original binary bytes!');
    }
    console.log(`✓ Binary data matches original buffer byte-for-byte (${downloadedBuffer.length} bytes).\n`);

    // 4. Test storing photo reference in JobCard model
    console.log('[5/6] Creating mock JobCard with new persistent photo schema...');
    const sampleJobCard = new JobCard({
      jobCardNo: `TEST-JC-${Date.now().toString().slice(-4)}`,
      date: new Date(),
      time: '10:30 AM',
      odometerReading: 45000,
      serviceAdvisorId: new mongoose.Types.ObjectId(),
      status: 'Work in Progress',
      vehicleId: new mongoose.Types.ObjectId(),
      customerId: new mongoose.Types.ObjectId(),
      photos: [{
        url: `/api/jobcards/photo/${testFileId.toString()}`,
        publicId: testFileId.toString(),
        photoType: photoType,
        filename: originalName,
        originalName: originalName,
        mimeType: mimeType,
        size: mockImageBuffer.length,
        uploadedAt: new Date(),
        uploadedBy: 'Antigravity Test Staff'
      }]
    });

    const savedJc = await sampleJobCard.save();
    testJobCardId = savedJc._id;
    console.log(`✓ Saved JobCard: ${savedJc.jobCardNo} (ID: ${savedJc._id})`);
    console.log(`✓ Attached photos count: ${savedJc.photos.length}`);
    console.log(`✓ Photo URL: ${savedJc.photos[0].url}`);
    console.log(`✓ Photo Type: ${savedJc.photos[0].photoType}`);
    console.log(`✓ Uploaded By: ${savedJc.photos[0].uploadedBy}\n`);

    // 5. Simulate reopening JobCard from database
    console.log('[6/6] Simulating reopening JobCard after server restart / session reload...');
    const reopenedJc = await JobCard.findById(testJobCardId);
    if (!reopenedJc || !reopenedJc.photos || reopenedJc.photos.length === 0) {
      throw new Error('Photo record missing upon reopening JobCard!');
    }
    const retrievedPhoto = reopenedJc.photos[0];
    const retrievedFileId = retrievedPhoto.url.replace('/api/jobcards/photo/', '');
    const persistentMeta = await photoExists(retrievedFileId);
    if (!persistentMeta) {
      throw new Error('Photo in database is missing backing file in GridFS!');
    }
    console.log(`✓ Persistent check passed! Backing GridFS file ${persistentMeta._id} is permanently stored in MongoDB Atlas.\n`);

    // Cleanup test data
    console.log('🧹 Cleaning up test artifacts...');
    await deletePhotoFile(testFileId);
    await JobCard.findByIdAndDelete(testJobCardId);
    console.log('✓ Cleaned up test photo and test JobCard.\n');

    console.log('====================================================');
    console.log('🎉 ALL PERSISTENCE TESTS PASSED SUCCESSFULLY! (100%)');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    if (testFileId) await deletePhotoFile(testFileId).catch(() => {});
    if (testJobCardId) await JobCard.findByIdAndDelete(testJobCardId).catch(() => {});
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

runTest();
