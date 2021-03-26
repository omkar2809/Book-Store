require('dotenv').config()
const AWS = require('aws-sdk')
const stripe = require('stripe')(process.env.STRIPE_SK)
const { response } = require('../utils/response')
const { v4: uuid } = require('uuid')

const db = new AWS.DynamoDB.DocumentClient()

const usersTable = process.env.USERS_TABLE

const productTable = process.env.PRODUCTS_TABLE

const ordersTable = process.env.ORDERS_TABLE

exports.postOrder = async event => {
    const body = JSON.parse(event.body)
    const userEmail = event.requestContext.authorizer.email
    try {
        const { Item: user } = await db.get({
            TableName: usersTable,
            Key: {
                email: userEmail
            }
        }).promise()
        
        let totalSum = 0
        let stockError = false
        let books = await Promise.all(user.cart.items.map(async item => {
            const { Item: book } = await db.get({
                TableName: productTable,
                Key: { id: item.bookId }
            }).promise()
            if(book) {
                if(book.stock == 0){
                    stockError = true
                }
                totalSum += item.quantity * book.price
                return { quantity: item.quantity, book: book }
            }
        }))

        if(stockError) {
            return response(400, { message: 'Out of Stock' })
        }

        books = books.filter(Boolean)
        console.log(books)

        const { email, authToken } = body
        const { token } = authToken
        const { card } = token

        console.log(card);
        const orderId = uuid()

        const customer = await stripe.customers.create({
                email: email,
                source: token.id
        })
        console.log('Customer Created.....')
        console.log(customer)

        const stripeResponse = await stripe.charges.create({
            amount: totalSum * 100,
            currency: 'INR',
            customer: customer.id,
            receipt_email: email,
            description: 'Your Order',
            shipping: {
                name: card.name,
                address: {
                    line1: "Mumbai",
                    country: card.address_country,
                }
            }
        },{ idempotencyKey: orderId})

        console.log("charge response")
        console.log(stripeResponse)

        await db.put({
            TableName: ordersTable,
            Item: {
                id: orderId,
                books: books,
                buyerEmail: userEmail,
                totalSum: totalSum,
                createdAt: new Date().toISOString()
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

        await Promise.all(books.map(async item => {
            await db.update({
                TableName: productTable,
                Key: {
                    id: item.book.id
                },
                UpdateExpression: 'SET stock = :stock, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':stock': item.book.stock - item.quantity,
                    ':updatedAt': new Date().toISOString()
                }
            }).promise()
        }))

        return response(200, { message: 'Books Ordered Successfully', response: stripeResponse })
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
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
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}