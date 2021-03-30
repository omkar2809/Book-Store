const AWS = require('aws-sdk')
const { v4: uuid } = require('uuid')
const fileType = require('file-type')

const { response } = require('../utils/response')

const db = new AWS.DynamoDB.DocumentClient()
const s3 = new AWS.S3()

const productTable = process.env.PRODUCTS_TABLE

exports.getBooks = async event => {
    try{
        const { Items: books } = await db.scan({ 
            TableName: productTable,
            FilterExpression: 'stock <> :stock',
            ExpressionAttributeValues: {
                ':stock': 0
            }
        }).promise()
        return response(200, books)
    }
    catch(err) {
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.getBook = async event => {
    try{
        const id = event.pathParameters.id
        const params = {
            Key: {
                id: id
            },
            TableName: productTable
        }
        const { Item: book } = await db.get(params).promise() 
        if(!book) {
            return response(404, { message: 'Book Not Found' })
        }
        return response(200, book)
    }
    catch(err) {
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.addBook = async event => {
    const body = JSON.parse(event.body)
    const sellerEmail = event.requestContext.authorizer.email
    const sellerId = event.requestContext.authorizer.userId

    const title = body.title
    const description = body.description
    const price = body.price
    const author = body.author
    const publisher = body.publisher
    const stock = body.stock
    const imageData = body.imageUrl

    id = uuid()
    try {
        const buffer = Buffer.from(imageData, 'base64');
        const fileInfo = await fileType.fromBuffer(buffer);
        const detectedExt = fileInfo.ext
        const detectedMime = fileInfo.mime
        const name = uuid();
        const key = `${name}-${Math.floor(100000 + Math.random() * 900000).toString()}.${detectedExt}`
        const uploadedImage = await s3
            .upload({
                Body: buffer,
                Key: key,
                ContentType: detectedMime,
                Bucket: process.env.IMAGE_UPLOAD_BUCKET,
                ACL: 'public-read',
            })
            .promise();

        const imageUrl = uploadedImage.Location

        await db.put({
            TableName: productTable,
            Item: {
                id: id,
                sellerId: sellerId,
                sellerEmail: sellerEmail,
                title: title,
                description: description,
                imageUrl: imageUrl,
                price: price,
                author: author,
                publisher: publisher,
                stock: stock,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        }).promise()
        return response(200, { message: 'Book Created' })
    }
    catch(err) {
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.updateBook = async event => {
    const body = JSON.parse(event.body)
    const id = event.pathParameters.id

    const sellerEmail = event.requestContext.authorizer.email
    const sellerId = event.requestContext.authorizer.userId

    try {
        const params = {
            TableName: productTable,
            Key: {
                id: id
            }
        }
        const { Item: book } = await db.get(params).promise() 
        console.log(book)
        if(!book) {
            return response(404, { message: 'Book Not Found' })
        }
        if(book.sellerEmail !== sellerEmail && book.sellerId !== sellerId) {
            return response(403, { message: 'Unauthorized' })
        }

        if (body.imageUrl) {
            const oldImageUrl = book.imageUrl.split('/')
            console.log('oldImageUrl', oldImageUrl)
            const oldKey = oldImageUrl[oldImageUrl.length - 1]
            console.log('oldKey', oldKey)
            await s3.deleteObject({
                Bucket: process.env.IMAGE_UPLOAD_BUCKET,
                Key: oldKey
            }).promise()
            const imageData = body.imageUrl
            const buffer = Buffer.from(imageData, 'base64');
            const fileInfo = await fileType.fromBuffer(buffer);
            const detectedExt = fileInfo.ext
            const detectedMime = fileInfo.mime
            const name = uuid();
            const key = `${name}-${Math.floor(100000 + Math.random() * 900000).toString()}.${detectedExt}`

            const uploadedImage = await s3
            .upload({
                Body: buffer,
                Key: key,
                ContentType: detectedMime,
                Bucket: process.env.IMAGE_UPLOAD_BUCKET,
                ACL: 'public-read',
            })
            .promise();
            body.imageUrl = uploadedImage.Location
        }

        const expressionAttributeValues = {
            ':updatedAt': new Date().toISOString()
        }
        var updatedExpression = `SET `
        Object.keys(body).map(k => {
            expressionAttributeValues[`:${k}`] = body[k]
            updatedExpression += `${k} = :${k}, `
        })
        updatedExpression += 'updatedAt = :updatedAt'
        await db.update({
            ...params,
            UpdateExpression: updatedExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'UPDATED_NEW'
        }).promise()
        return response(200, { message: 'Book updated' })
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.deleteBook = async event => {
    const id = event.pathParameters.id

    const sellerEmail = event.requestContext.authorizer.email
    const sellerId = event.requestContext.authorizer.userId

    try {
        const params = {
            TableName: productTable,
            Key: {
                id: id
            }
        }
        const { Item: book } = await db.get(params).promise() 
        console.log(book)
        if(!book) {
            return response(404, { message: 'Book Not Found' })
        }
        if(book.sellerEmail !== sellerEmail && book.sellerId !== sellerId) {
            return response(403, { message: 'Unauthorized' })
        }
        const imageUrl = book.imageUrl.split('/')
        console.log('imageUrl', imageUrl)
        const key = imageUrl[imageUrl.length - 1]
        console.log('key', key)
        await s3.deleteObject({
            Bucket: process.env.IMAGE_UPLOAD_BUCKET,
            Key: key
        }).promise()
        await db.delete(params).promise()
        return response(200, { message: 'Book Deleted' })
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.getSellerBooks = async event => {
    const sellerEmail = event.requestContext.authorizer.email
    try{
        const { Items: books } = await db.scan({ 
            TableName: productTable,
            FilterExpression: 'sellerEmail = :sellerEmail',
            ExpressionAttributeValues: {
                ':sellerEmail': sellerEmail
            }
        }).promise()
        return response(200, books)
    }
    catch(err) {
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}