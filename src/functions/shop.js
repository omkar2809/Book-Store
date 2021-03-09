const AWS = require('aws-sdk')
const uuid = require('uuid')

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