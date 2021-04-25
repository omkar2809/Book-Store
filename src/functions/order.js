require('dotenv').config()
const AWS = require('aws-sdk')
const stripe = require('stripe')(process.env.STRIPE_SK)
const nodemailer = require('nodemailer')
const sendgridTransport = require('nodemailer-sendgrid-transport')
const PDFDocument = require("pdfkit")
const { response } = require('../utils/response')
const { v4: uuid } = require('uuid')

const db = new AWS.DynamoDB.DocumentClient()

const transporter = nodemailer.createTransport(
	sendgridTransport({
		auth: {
			api_key: process.env.SENDGRID_KEY
		}
	})
)

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

        return response(200, { message: 'Books Ordered Successfully', response: stripeResponse, orderId: orderId })
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
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.getInvoice = async event => {
    const buyerEmail = event.requestContext.authorizer.email
    const orderId = event.pathParameters.id
    try {
        const { Item: order } = await db.get({
            TableName: ordersTable,
            Key: {
                id: orderId
            }
        }).promise()
        console.log(order)
        if (!order) {
            return response(400, { message: 'Order not found!' })
        }
        if (order.buyerEmail !== buyerEmail) {
            return response(401, { message: 'Unauthorized' })
        }
        const pdfBuffer = await new Promise(resolve => {
            const doc = new PDFDocument()
            doc.fontSize(26).text('Invoice', {
                underline: true,
            })
            doc.text('-------------------------------')
            let totalPrice = 0
            order.books.forEach(prod => {
                totalPrice += prod.quantity * prod.book.price
                doc.fontSize(14).text(prod.book.title + ' - ' + prod.quantity + ' x ' + 'Rs.' + prod.book.price)
            })
            doc.text('-------------------------------')
            doc.fontSize(20).text('Total Price Rs.' + totalPrice)
            doc.end()
            const buffers = []
                doc.on("data", buffers.push.bind(buffers))
                doc.on("end", () => {
                const pdfData = Buffer.concat(buffers)
                resolve(pdfData)
            })
        })
        await transporter.sendMail({
            to: buyerEmail,
            from: process.env.SENDER_EMAIL,
            subject: 'Invoice',
            html: `
                <h2>Invoice for Order Id #${order.id}</h2>
            `,
            attachments: [{  
                filename: 'invoice.pdf',
                content: pdfBuffer,
                contentType: 'application/pdf'
            }]
        })
        return response(200, {message: 'Invoice send to registered Email'})
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}