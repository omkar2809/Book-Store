const AWS = require('aws-sdk')

const { response } = require('../utils/response')

const db = new AWS.DynamoDB.DocumentClient()

const usersTable = process.env.USERS_TABLE

const productTable = process.env.PRODUCTS_TABLE

exports.getCart = async event => {
    const userEmail = event.requestContext.authorizer.email
    try {
        const { Item: user } = await db.get({
            TableName: usersTable,
            Key: {
                email: userEmail
            }
        }).promise()
        return response(200, {cart: user.cart})
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.addToCart = async event => {
    const bookId = event.pathParameters.id
    const userEmail = event.requestContext.authorizer.email
    console.log(userEmail)
    try {
        const { Item: book } = await db.get({
            TableName: productTable,
            Key: {
                id: bookId
            }
        }).promise() 
        if(!book) {
            return response(404, { message: 'Book Not Found' })
        }
        console.log(book)
        const params = {
            TableName: usersTable,
            Key: {
                email: userEmail
            }
        }
        const { Item: user } = await db.get(params).promise()
        console.log(user)
        const cart = user.cart
        console.log(cart)
        const cartBookIndex = cart.items.findIndex(cb => cb.bookId === bookId)
        let newQty = 1
        const updatedCartItems = [...cart.items]
    
        if(cartBookIndex >= 0) {
            newQty = cart.items[cartBookIndex].quantity + 1
            updatedCartItems[cartBookIndex].quantity = newQty
        } else {
            updatedCartItems.push({
                bookId: bookId,
                quantity: newQty
            })
        }
    
        const updatedCart = {
            items: updatedCartItems
        }
        await db.update({
            ...params,
            UpdateExpression: 'SET cart = :cart',
            ExpressionAttributeValues: {
                ':cart': updatedCart
            },
            ReturnValues: 'UPDATED_NEW'
        }).promise()
        return response(200, { message: 'Book added in cart' })
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.removeFromCart = async event => {
    const bookId = event.pathParameters.id
    const userEmail = event.requestContext.authorizer.email
    console.log(userEmail)
    try {
        const { Item: book } = await db.get({
            TableName: productTable,
            Key: {
                id: bookId
            }
        }).promise() 
        if(!book) {
            return response(404, { message: 'Book Not Found' })
        }
        console.log(book)
        const params = {
            TableName: usersTable,
            Key: {
                email: userEmail
            }
        }
        const { Item: user } = await db.get(params).promise()
        console.log(user)
        const cart = user.cart
        console.log(cart)
        
        const updatedCartItems = cart.items.filter(item => item.bookId !== bookId)

        const updatedCart = {
            items: updatedCartItems
        }
        await db.update({
            ...params,
            UpdateExpression: 'SET cart = :cart',
            ExpressionAttributeValues: {
                ':cart': updatedCart
            },
            ReturnValues: 'UPDATED_NEW'
        }).promise()
        return response(200, { message: 'Book removed from cart' })
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.clearCart = async event => {
    const userEmail = event.requestContext.authorizer.email
    try {
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
        return response(200, { message: 'Cart is now empty' })
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}