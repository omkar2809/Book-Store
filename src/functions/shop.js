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
        const id = event.pathParameters.id;
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
                userId: sellerId,
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