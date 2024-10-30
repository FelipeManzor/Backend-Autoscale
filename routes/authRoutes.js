const express = require('express');
const { body, validationResult } = require('express-validator');
// const logger = require('../config/logger');
const router = express.Router();
const Cognito = require('@aws-sdk/client-cognito-identity-provider');
const {
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const clientId = "3i7uu7alvdm53mtjq6gfhhut5m"; // Replace with your app client ID
const region = 'ap-southeast-2'; // Replace with your AWS Cognito region

// Cognito Client
const cognitoClient = new Cognito.CognitoIdentityProviderClient({ region: "ap-southeast-2" });

// MFA
const { AssociateSoftwareTokenCommand, VerifySoftwareTokenCommand,SetUserMFAPreferenceCommand } = require('@aws-sdk/client-cognito-identity-provider');
const qrcode = require('qrcode'); // To generate QR code
const authenticateJWT = require('../middleware/auth'); // Ensure this path is correct

// Route to register a new user
router.post('/register',
  body('username').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 5 }).withMessage('Password must be at least 5 characters long'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;
    try {
      const signUpCommand = new Cognito.SignUpCommand({
        ClientId: clientId,
        Username: username,
        Password: password,
        UserAttributes: [
          {
            Name: 'email',
            Value: username
          }
        ]
      });

      const response = await cognitoClient.send(signUpCommand);
      // logger.info('User registered with Cognito', response);
      res.status(201).send('User registered, please confirm email');
    } catch (err) {
      console.log('Error registering user with Cognito', err);

      // Return a detailed error response to the frontend
      res.status(500).json({
        message: 'Error registering user with Cognito',
        details: err.message,  // Add the error message from Cognito
      });
    }
  }
);


router.post('/login',
  body('username').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return validation errors
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
      const authCommand = new Cognito.InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        }
      });

      const response = await cognitoClient.send(authCommand);

      if (response.ChallengeName === 'MFA_SETUP') {
        // User needs to set up MFA
        res.json({
          ChallengeName: response.ChallengeName,
          Session: response.Session,
          message: 'User needs to set up MFA',
        });
      } else if (response.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
        // MFA is required, send challenge information back to the client
        res.json({
          ChallengeName: response.ChallengeName,
          Session: response.Session,
          message: 'MFA required',
        });
      } else if (response.AuthenticationResult) {
        // Successful authentication without MFA
        const { AccessToken, IdToken } = response.AuthenticationResult;
        res.json({ accessToken: AccessToken, idToken: IdToken });
      } else {
        throw new Error('Authentication failed. Please check your credentials and try again.');
      }
    } catch (err) {
      console.error('Error logging in with Cognito', err);
      if (err.name === 'NotAuthorizedException') {
        res.status(401).json({ message: err.message });
      } else if (err.name === 'UserNotConfirmedException') {
        res.status(400).json({ message: 'User is not confirmed. Please confirm your account.' });
      } else {
        res.status(500).json({ message: 'Error logging in', details: err.message });
      }
    }
  }
);




// POST /auth/verify
router.post('/verify', async (req, res) => {
  const { username, code } = req.body;
  const client = new CognitoIdentityProviderClient({ region });
  const command = new ConfirmSignUpCommand({
    ClientId: clientId,
    Username: username,
    ConfirmationCode: code,
  });

  try {
    const response = await client.send(command);
    console.log('Cognito response:', response);
    res.status(200).json({ message: 'Account verified successfully!' });
  } catch (error) {
    console.error('Error confirming sign-up:', error);
    res.status(400).json({
      message:
        error.name === 'CodeMismatchException'
          ? 'Invalid code. Please try again.'
          : error.message || 'An error occurred during verification.',
    });
  }
});

//// MFA ROUTES 

router.post('/mfa/totp/setup', authenticateJWT, async (req, res) => {
  try {
    // Get the AccessToken from the Authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'Missing Authorization header' });
    }

    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'Invalid Authorization header format' });
    }

    const AccessToken = tokenParts[1];

    // Call AssociateSoftwareTokenCommand with the AccessToken
    const command = new AssociateSoftwareTokenCommand({
      AccessToken,
    });

    const response = await cognitoClient.send(command);

    if (response.SecretCode) {
      console.log(`SecretCode received: ${response.SecretCode}`);

      // Generate a QR code for the user to scan with Google Authenticator
      const otpAuthUrl = `otpauth://totp/MyApp:${req.user.username}?secret=${response.SecretCode}&issuer=MyApp`;
      const qrCodeDataURL = await qrcode.toDataURL(otpAuthUrl);

      res.json({ qrCode: qrCodeDataURL });
    } else {
      res.status(400).json({ message: 'Failed to generate TOTP secret.' });
    }
  } catch (error) {
    console.error('Error setting up TOTP MFA:', error);

    if (error.name === 'NotAuthorizedException') {
      return res.status(401).json({ message: 'Access token is invalid or expired. Please log in again.' });
    }

    res.status(500).json({ message: 'Error setting up TOTP MFA.', details: error.message });
  }
});

router.post('/mfa/totp/verify', authenticateJWT, async (req, res) => {
  try {
    // Get the TOTP code from the request body
    const { UserCode } = req.body;

    if (!UserCode) {
      return res.status(400).json({ message: 'UserCode (TOTP code) is required.' });
    }

    // Get the AccessToken from the Authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'Missing Authorization header' });
    }

    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'Invalid Authorization header format' });
    }

    const AccessToken = tokenParts[1];

    // Call VerifySoftwareTokenCommand with the AccessToken and UserCode
    const verifyCommand = new VerifySoftwareTokenCommand({
      AccessToken,
      UserCode, // The 6-digit code from the authenticator app
      FriendlyDeviceName: 'My Authenticator App', // Optional
    });

    const response = await cognitoClient.send(verifyCommand);

    if (response.Status === 'SUCCESS') {
      // Enable TOTP MFA for the user
      const mfaCommand = new SetUserMFAPreferenceCommand({
        AccessToken,
        SoftwareTokenMfaSettings: {
          Enabled: true,
          PreferredMfa: true,
        },
      });

      await cognitoClient.send(mfaCommand);

      res.json({ message: 'TOTP MFA setup and verified successfully.' });
    } else {
      res.status(400).json({ message: 'Failed to verify TOTP code.' });
    }
  } catch (error) {
    console.error('Error verifying TOTP MFA:', error);

    if (error.name === 'NotAuthorizedException') {
      return res.status(401).json({ message: 'Access token is invalid or expired. Please log in again.' });
    } else if (error.name === 'CodeMismatchException') {
      return res.status(400).json({ message: 'Invalid TOTP code. Please try again.' });
    }

    res.status(500).json({ message: 'Error verifying TOTP MFA.', details: error.message });
  }
});

router.post('/respond-to-mfa-challenge', async (req, res) => {
  const { username, mfaCode, session } = req.body;

  if (!username || !mfaCode || !session) {
    return res.status(400).json({ message: 'Username, mfaCode, and session are required.' });
  }

  try {
    const challengeCommand = new Cognito.RespondToAuthChallengeCommand({
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      ClientId: clientId,
      Session: session,
      ChallengeResponses: {
        USERNAME: username,
        SOFTWARE_TOKEN_MFA_CODE: mfaCode,
      },
    });

    const response = await cognitoClient.send(challengeCommand);

    if (response.AuthenticationResult) {
      const { AccessToken, IdToken } = response.AuthenticationResult;
      res.json({ accessToken: AccessToken, idToken: IdToken });
    } else {
      throw new Error('MFA challenge failed.');
    }
  } catch (err) {
    console.error('Error responding to MFA challenge', err);

    if (err.name === 'CodeMismatchException') {
      res.status(400).json({ message: 'Invalid MFA code. Please try again.' });
    } else {
      res.status(500).json({ message: 'Error responding to MFA challenge', details: err.message });
    }
  }
});

router.post('/mfa/disable', authenticateJWT, async (req, res) => {
  try {
    // Get the AccessToken from the Authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'Missing Authorization header' });
    }

    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'Invalid Authorization header format' });
    }

    const AccessToken = tokenParts[1];

    // Disable TOTP MFA for the user
    const mfaCommand = new SetUserMFAPreferenceCommand({
      AccessToken,
      SoftwareTokenMfaSettings: {
        Enabled: false,
        PreferredMfa: false,
      },
    });

    await cognitoClient.send(mfaCommand);

    res.json({ message: 'MFA has been disabled successfully.' });
  } catch (error) {
    console.error('Error disabling MFA:', error);

    if (error.name === 'NotAuthorizedException') {
      return res.status(401).json({ message: 'Access token is invalid or expired. Please log in again.' });
    }

    res.status(500).json({ message: 'Error disabling MFA.', details: error.message });
  }
});

module.exports = router;
