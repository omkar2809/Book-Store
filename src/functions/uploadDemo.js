// const formParser = require("../utils/formParser")
const {v4: uuid} = require('uuid')
const fileType = require('file-type')
const AWS = require("aws-sdk")
const s3 = new AWS.S3()

exports.handler = async event => {
    const body = JSON.parse(event.body)
    const imageData = body.image
    try {
        const buffer = Buffer.from(imageData, 'base64');
        const fileInfo = await fileType.fromBuffer(buffer);
        const detectedExt = fileInfo.ext
        const detectedMime = fileInfo.mime
        const name = uuid();
        const key = `${name}-${new Date().toISOString()}.${detectedExt}`
        const uploadedImage = await s3
            .upload({
                Body: buffer,
                Key: key,
                ContentType: detectedMime,
                Bucket: process.env.IMAGE_UPLOAD_BUCKET,
                ACL: 'public-read',
            })
            .promise();
        return {
            statusCode: 200,
            body: JSON.stringify({
                detectedExt: detectedExt,
                detectedMime: detectedMime,
                uploadedImage: uploadedImage
            })
        }
    }
    catch(err) {
        console.log(err)
    }
}