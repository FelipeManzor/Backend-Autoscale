// utils/imageUtils.js
const fs = require('fs');
const Jimp = require('jimp');
const Image = require('../models/image');

// I CAN MOVE THIS TWO TO IMAGE ROUTES
const S3 = require("@aws-sdk/client-s3");
const s3Client2 = new S3.S3Client({ region: 'ap-southeast-2' });
const S3Presigner = require("@aws-sdk/s3-request-presigner");

const createCollage = async (
  image,
  imageId,
  bucketName,
  collageFileName,
  numRows = 3,
  numCols = 3,
  resizeWidth = 800,
  resizeHeight = 800,
  collageWidth,
  collageHeight
) => {



  // If collageWidth and collageHeight are not provided, calculate them
  if (!collageWidth) {
    collageWidth = resizeWidth * numCols;
  }
  if (!collageHeight) {
    collageHeight = resizeHeight * numRows;
  }

  // Create a new Jimp image for the collage
  let collage = new Jimp(collageWidth, collageHeight);

  const totalIters = numRows * numCols;
  let iterCount = 0;

  try {
    // Composite the images into the collage
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const x = col * resizeWidth;
        const y = row * resizeHeight;
        collage.composite(
          image.clone().resize(resizeWidth, resizeHeight),
          x,
          y
        );
        iterCount++;

        // Update progress
        const progress = 50 + Math.floor((iterCount / totalIters) * 50);
        await Image.findByIdAndUpdate(imageId, {
          processingStatus: 'Creating Collage',
          progressPercentage: progress,
        });
      }
    }
  
    // Get the collage as a buffer
    const collageBuffer = await collage.getBufferAsync(Jimp.MIME_JPEG);
    //const collageBuffer = fs.readFileSync('test.jpge');
    // console.log('HEREEEEE 1');
    // Upload the collage to S3
    const putCollageCommand = new S3.PutObjectCommand({
      Bucket: bucketName,
      Key: collageFileName,
      Body: collageBuffer,
      ContentType: 'image/jpge',
    });

    try {
      console.log('Uploading collage image to S3...');
      await s3Client2.send(putCollageCommand);
      console.log('Collage image uploaded to S3.');

      // Pre signed url 
      try {
        const command = new S3.GetObjectCommand({
                Bucket: bucketName,
                Key: collageFileName,
            });
        const presignedURL = await S3Presigner.getSignedUrl(s3Client2, command, {expiresIn: 36000} );
        //  console.log('Pre-signed URL to get the object:')
        //  console.log(presignedURL);

        await Image.findByIdAndUpdate(imageId, {
          presignedUrlCollage: presignedURL
        });

    } catch (err) {
        console.log(err);
    }

    } catch (error) {
      console.error('Error uploading collage image to S3:', error);
      throw error;
    }
  } finally {
    // Clean up
    collage.bitmap.data = null; // Clear the buffer data
    collage = null;
    image = null;

    if (global.gc) {
      global.gc();
    }
  }


};

module.exports = { createCollage };
