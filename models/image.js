const mongoose = require('mongoose');

// Define the image schema with additional fields and validation
const imageSchema = new mongoose.Schema({
  username: {
    type: String,
    required: false, // Make originalName a required field
  },
  originalName: {
    type: String,
    required: false, // Make originalName a required field
  },
  processedName: {
    type: String,
    required: false, // Make processedName a required field
  },
  collageName: {
    type: String,
    required: false, // Make collageName a required field
  },
  uploadDate: {
    type: Date,
    default: Date.now, // Default to current date and time
  },
  resizeWidth: {
    type: Number,
    required: false, // Optional field for width of resized image
  },
  resizeHeight: {
    type: Number,
    required: false, // Optional field for height of resized image
  },
  collageRows: {
    type: Number,
    required: false, // Optional field for number of rows in collage
  },
  collageCols: {
    type: Number,
    required: false, // Optional field for number of columns in collage
  },
  outputSizeWidth: {
    type: Number,
    required: false, // Optional field for width of output image
  },
  outputSizeHeight: {
    type: Number,
    required: false, // Optional field for height of output image
  },
  width: {
    type: Number,
    required: false, // Optional field for width of the image
  },
  height: {
    type: Number,
    required: false, // Optional field for height of the image
  },
  size: {
    type: Number,
    required: false, // Optional field for file size in bytes
  },
  isPublic: {
    type: Boolean,
    default: true, // Default to true
  },
  processingStatus: {
    type: String,
    default: 'pending', // Possible values: 'pending', 'processing', 'complete'
  },
  progressPercentage: {
    type: Number,
    default: 0,
  },
  presignedUrlCollage: {
    type: String,
    default: '',
  },
  presignedUrlOriginal: {
    type: String,
    default: '',
  },
  presignedUrlPreProcessed: {
    type: String,
    default: '',
  }
});

// Export the model
module.exports = mongoose.model('Image', imageSchema);
