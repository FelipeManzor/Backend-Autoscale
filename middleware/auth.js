const { CognitoJwtVerifier } = require('aws-jwt-verify');
// check this and aouth routes

const verifier = CognitoJwtVerifier.create({
  userPoolId: "ap-southeast-2_3JOC15X3L",
  tokenUse: "access",
  clientId: "3i7uu7alvdm53mtjq6gfhhut5m",
});

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization.split(' ')[1]; // Assuming Bearer token

  try {
    const payload = await verifier.verify(token);
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).send('Invalid or expired token');
  }
};

module.exports = authenticate;