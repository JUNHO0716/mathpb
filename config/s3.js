import AWS from 'aws-sdk';
import multer from 'multer';
import multerS3 from 'multer-s3';

// AWS S3 연결
export const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

export const deleteS3 = key =>
  s3.deleteObject({ Bucket: process.env.AWS_S3_BUCKET, Key: key }).promise();

// 프로필 사진 업로더
export const avatarUpload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET,      
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req,file,cb)=> {
      const ext=file.originalname.split('.').pop();
      cb(null,`profile/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    }
  })
});

// 일반 파일 업로더
export const fileUpload = multer({
  storage: multerS3({ s3, bucket: process.env.AWS_S3_BUCKET,
    key: (req,file,cb)=> {
      const today=new Date().toISOString().slice(0,10);
      const ext=file.originalname.split('.').pop();
      cb(null,`files/${today}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    }
  })
});