const AWS = require('aws-sdk')

const { response } = require('../utils/response')
const { v4: uuid } = require('uuid')

const db = new AWS.DynamoDB.DocumentClient()

const usersTable = process.env.USERS_TABLE

const productTable = process.env.PRODUCTS_TABLE

const ordersTable = process.env.ORDERS_TABLE

exports.postOrder = async event => {
    const userEmail = event.requestContext.authorizer.email
    try {
        const { Item: user } = await db.get({
            TableName: usersTable,
            Key: {
                email: userEmail
            }
        }).promise()
        
        let totalSum = 0
        const books = await Promise.all(user.cart.items.map(async item => {
            const { Item: book } = await db.get({
                TableName: productTable,
                Key: { id: item.bookId }
            }).promise()
            totalSum += item.quantity * book.price
            return { quantity: item.quantity, book: book }
        }))
        console.log(books)

        // TODO Stripe code

        await db.put({
            TableName: ordersTable,
            Item: {
                id: uuid(),
                books: books,
                buyerEmail: userEmail,
                totalSum: totalSum
            }
        }).promise()

        await db.update({
            TableName: usersTable,
            Key: {
                email: userEmail
            },
            UpdateExpression: 'SET cart = :cart',
            ExpressionAttributeValues: {
                ':cart': { items: [] }
            },
            ReturnValues: 'UPDATED_NEW'
        }).promise()
        return response(200, { message: 'Books Ordered Successfully' })
    }
    catch(err) {
        console.log(err)
        return response(500, { message: 'Something went wrong!', error: {err} })
    }
}

exports.getOrders = async event => {
    const buyerEmail = event.requestContext.authorizer.email
    try {
        const { Items: orders } = await db.scan({
            TableName: ordersTable,
            FilterExpression: 'buyerEmail = :buyerEmail',
            ExpressionAttributeValues: {
                ':buyerEmail': buyerEmail
            }
        }).promise()
        console.log(orders)
        return response(200, {orders})
    }
    catch(Err) {
        console.log(err)
        return response(500, { message: 'Something went wrong!', error: {err} })
    }
}