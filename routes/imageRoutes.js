const express = require('express');
const multer = require('multer');
const Jimp = require('jimp');
const Image = require('../models/image');
const authenticateJWT = require('../middleware/auth');
const { createCollage } = require('../utils/imageUtils');
// const logger = require('../config/logger');
const router = express.Router();
const S3Presigner = require("@aws-sdk/s3-request-presigner");
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
// Configure AWS S3 Client
const S3 = require("@aws-sdk/client-s3");
const s3Client = new S3Client({ region: 'ap-southeast-2' });
const bucketName = 'n11373725-assessment3'; // Replace with your bucket name


// Initialize Memcached (Elasticache) client
const Memcached = require('memcached');
const util = require('util');
const memcached = new Memcached("n11373725-assessment2.km2jzi.cfg.apse2.cache.amazonaws.com:11211");
memcached.getAsync = util.promisify(memcached.get);
memcached.setAsync = util.promisify(memcached.set);



// Configure multer to store files in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /upload/start - Upload the image and save metadata
router.post('/upload/start', authenticateJWT, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      resizeWidth = 200,
      resizeHeight = 200,
      collageRows = 6,
      collageCols = 6,
      outputSizeWidth = 1000,
      outputSizeHeight = 1000,
      username,
    } = req.body;

    // Create a new Image document
    const newImage = new Image({
      resizeWidth,
      resizeHeight,
      collageRows,
      collageCols,
      outputSizeWidth,
      outputSizeHeight,
      username,
      processingStatus: 'Uploaded',
      progressPercentage: 0,
    });
    await newImage.save();

    const newFileName = `${newImage._id.toString()}${path.extname(req.file.originalname)}`;
    // Upload the image to S3
    const putObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: newFileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    });
    await s3Client.send(putObjectCommand);
    
    // Update image document
    newImage.originalName = newFileName;
    newImage.processedName = `processed-${newFileName}`;
    newImage.collageName = `collage-${newFileName}`;
    await newImage.save();
    res.json({
      imageId: newImage._id,
      fileName: newFileName,
    });
  } catch (err) {
    console.log('Error uploading image', err);
    res.status(500).send('Error uploading image');
  }

  


});

// POST /upload/process/:id - Process the uploaded image
router.post('/upload/process/:id', authenticateJWT, async (req, res) => {
  try {
    const imageId = req.params.id;
    const imageDoc = await Image.findById(imageId);
    if (!imageDoc) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const {
      resizeWidth = imageDoc.resizeWidth,
      resizeHeight = imageDoc.resizeHeight,
      collageRows = imageDoc.collageRows,
      collageCols = imageDoc.collageCols,
      outputSizeWidth = imageDoc.outputSizeWidth,
      outputSizeHeight = imageDoc.outputSizeHeight,
    } = req.body;

    await Image.findByIdAndUpdate(imageId, {
      processingStatus: 'Processing Started',
      progressPercentage: 10,
    });

    // Download the original image from S3
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: imageDoc.originalName,
    });
    const originalImageData = await s3Client.send(getObjectCommand);

    // Read the image data into a buffer
    const chunks = [];
    for await (const chunk of originalImageData.Body) {
      chunks.push(chunk);
    }
    const imageBuffer = Buffer.concat(chunks);

    // Process the image using Jimp
    const img = await Jimp.read(imageBuffer);
    await img.resize(parseInt(resizeWidth), parseInt(resizeHeight));

    // Save the processed image to a buffer
    const processedImageBuffer = await img.getBufferAsync(Jimp.MIME_JPEG);

    // Upload the processed image to S3
    const putProcessedImageCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: imageDoc.processedName,
      Body: processedImageBuffer,
      ContentType: 'image/jpeg',
    });
    await s3Client.send(putProcessedImageCommand);

          // Pre signed url 
    try {
      const command = new S3.GetObjectCommand({
            Bucket: bucketName,
            Key: imageDoc.processedName,
    });
    const presignedURL = await S3Presigner.getSignedUrl(s3Client, command, {expiresIn: 36000} );

    await Image.findByIdAndUpdate(imageId, {
      presignedUrlPreProcessed: presignedURL,
    });

    } catch (err) {
            console.log(err);
    }
    


    await Image.findByIdAndUpdate(imageId, {
      processingStatus: 'Image Resized',
      progressPercentage: 20,
    });

    // Create the collage
    await createCollage(
      img,
      imageId,
      bucketName,
      imageDoc.collageName,
      parseInt(collageRows),
      parseInt(collageCols)
    );

    await Image.findByIdAndUpdate(imageId, {
      processingStatus: 'Processing Done',
      progressPercentage: 100,
    });

    const finalImage = await Image.findById(imageId);
    // console.log(finalImage.presignedUrlCollage)

    res.json({
      processedImageUrl: `${finalImage.presignedUrlPreProcessed}`,
      collageImageUrl: `${finalImage.presignedUrlCollage}`,
    });
  } catch (err) {
    console.log('Error processing image', err);
    res.status(500).send('Error processing image');
  }
});

// GET /progress/:id - Get processing progress and URLs
router.get('/progress/:id', async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    res.json({
      processingStatus: image.processingStatus,
      progressPercentage: image.progressPercentage,
      originalImageUrl: image.originalName,
      processedImageUrl: image.presignedUrlPreProcessed,
      collageImageUrl: image.presignedUrlCollage,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching progress', error });
  }
});

// GET /pictures/:username - Get all pictures by username here I used the mem cache 
router.get('/pictures/:username', async (req, res) => {
  const username = req.params.username;

  try {
    // Check cache for data
    const cacheKey = `pictures:${username}`;
    const cachedData = await memcached.getAsync(cacheKey);

    if (cachedData) {
      console.log('Cache hit');
      return res.json(JSON.parse(cachedData)); // Return cached data if available
    }

    // If cache miss, query the database
    console.log('Cache miss');
    const pictures = await Image.find({ username });
    if (pictures.length === 0) {
      return res.status(404).json({ message: 'No pictures found for this username' });
    }

    // Update collage URL for each picture if necessary
    for (const picture of pictures) {
      if (!picture.presignedUrlCollage) {
        // If collage URL is missing, generate it
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: picture.collageName,
        });
        const presignedURL = await getSignedUrl(s3Client, command, { expiresIn: 36000 });

        // Update the document in the database with the new URL
        await Image.findByIdAndUpdate(picture._id, {
          presignedUrlCollage: presignedURL,
        });

        // Update the picture object locally for the response
        picture.presignedUrlCollage = presignedURL;
      }
    }

    // Cache the pictures data with the updated collage URLs
    await memcached.setAsync(cacheKey, JSON.stringify(pictures), 60); // Cache for 60 seconds

    res.json(pictures);
  } catch (error) {
    console.error('Error retrieving pictures:', error);
    res.status(500).json({ message: 'Error retrieving pictures', error: error.message });
  }
});

// GET /activity/:username - Retrieve user activity logs by username
router.get('/activity/:username', async (req, res) => {
  try {
    const username = req.params.username;

    // Query to fetch activity logs for the specified username
    const query = `
      SELECT log_id, user_id, activity_type, activity_description, activity_time, additional_data
      FROM user_activity_log
      WHERE user_id = ?
    `;

    // Access the MySQL connection from req
    const connection = req.dbConnection;

    // Ensure connection is available before running query
    if (!connection) {
      return res.status(500).json({ error: 'Database connection not initialized' });
    }

    // Execute the query
    connection.query(query, [username], (err, results) => {
      if (err) {
        console.log('Error fetching activity logs:', err);
        return res.status(500).json({ error: 'Failed to fetch activity logs' });
      }

      // Check if any logs are found
      if (results.length === 0) {
        return res.status(404).json({ message: 'No activity logs found for this user' });
      }

      // Return the activity logs
      res.json(results);
    });
  } catch (err) {
    console.log('Error retrieving activity logs:', err);
    res.status(500).send('Error retrieving activity logs');
  }
});

module.exports = router;
