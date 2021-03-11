const AWS = require('aws-sdk')
const { v4: uuid } = require('uuid')

const { response } = require('../utils/response')

const db = new AWS.DynamoDB.DocumentClient()

const productTable = process.env.PRODUCTS_TABLE

exports.getBooks = async event => {
    try{
        const { Items: books } = await db.scan({ TableName: productTable }).promise()
        return response(200, books)
    }
    catch(err) {
        return response(500, { message: 'Something went wrong!', error: {err} })
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
        return response(500, { message: 'Something went wrong!', error: {err} })
    }
}

exports.addBook = async event => {
    const body = JSON.parse(event.body)
    const sellerEmail = event.requestContext.authorizer.email
    const sellerId = event.requestContext.authorizer.userId

    const title = body.title
    const description = body.description
    const imageUrl = body.imageUrl
    const price = body.price
    const author = body.author
    const publisher = body.publisher

    id = uuid()
    try {
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
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        }).promise()
        return response(200, { message: 'Book Created' })
    }
    catch(err) {
        return response(500, { message: 'Something went wrong!', error: {err} })
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
        return response(500, { message: 'Something went wrong!', error: {err} })
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
        await db.delete(params).promise()
        return response(200, { message: 'Book Deleted' })
    }
    catch(err) {
        console.log(err)
        return response(500, { message: 'Something went wrong!', error: {err} })
    }
}