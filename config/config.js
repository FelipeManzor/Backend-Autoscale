module.exports = {
    PORT: process.env.PORT || 3001,
    JWT_SECRET: process.env.JWT_SECRET || 'jwt_secret',
    //  MONGO_URI: process.env.MONGO_URI || 'mongodb://mongodb:27017/imageDB'
    // mongodbadmin
    // MONGO_URI: process.env.MONGO_URI || 'mongodb://mongodbadmin:mongodbadmin@n11373725-assessment2.cluster-ce2haupt2cta.ap-southeast-2.docdb.amazonaws.com:27017/DB1?tls=true&tlsCAFile=global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false',
    // SQL_URI: process.env.MONGO_URI || 'mysql://admin:mongodbadmin@n11373725-assessment2-mysql.ce2haupt2cta.ap-southeast-2.rds.amazonaws.com:3306/'
};