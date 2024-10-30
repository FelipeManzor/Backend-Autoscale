const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const imageRoutes = require('./routes/imageRoutes');
const mongoose = require('mongoose');
const SecretsManager = require('@aws-sdk/client-secrets-manager');

// AWS Secrets Manager settings
const secret_name = 'n11373725-assessment2-secrets';
const client = new SecretsManager.SecretsManagerClient({ region: 'ap-southeast-2' });

// Function to retrieve secrets from AWS Secrets Manager
async function getSecrets() {
  try {
    const response = await client.send(
      new SecretsManager.GetSecretValueCommand({
        SecretId: secret_name,
      })
    );
    const secret = response.SecretString;
    return JSON.parse(secret); // Parse and return the secrets as JSON
  } catch (error) {
    console.error('Error retrieving secret:', error);
    throw error;
  }
}

// Function to initialize MongoDB connection after fetching secrets
async function initMongoConnection() {
  try {
    const secrets = await getSecrets();
    const MONGO_URI = process.env.MONGO_URI || secrets.MONGO_URI;
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('Error initializing MongoDB connection:', error);
  }
}

// Initialize app
const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Start the server and initialize both MongoDB and MySQL connections
async function startServer() {
  try {
    await initMongoConnection(); // Initialize MongoDB connection
    // Routes
    app.use('/auth', authRoutes);
    app.use('/images', imageRoutes);

    // Start the server
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
  }
}

startServer();
