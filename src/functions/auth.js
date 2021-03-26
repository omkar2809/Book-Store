const AWS = require('aws-sdk')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuid } = require('uuid')

const { response } = require('../utils/response')

const db = new AWS.DynamoDB.DocumentClient()

const usersTable = process.env.USERS_TABLE

exports.signUp = async event => {
    const body = JSON.parse(event.body)
    const email = body.email
    const name = body.name
    const phoneNo = body.phoneNo
    const password = body.password
    try {
        const { Item: user } = await db.get({
            Key: {
                email: email
            },
            TableName: usersTable
        }).promise()
        console.log(user)
        if (user) {
            return response(400, { message: 'User already exist!' })
        }
        const hashedPassword = await bcrypt.hash(password, 12)
        const id = uuid()
        await db.put({
            TableName: usersTable,
            Item: {
                id: id,
                email: email,
                password: hashedPassword,
                name: name,
                phoneNo: phoneNo,
                address: '',
                cart: { items: [] },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        }).promise()
        console.log('User created')
        return response(200, { message: 'User Created' })
    } catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.login = async event => {
    const body = JSON.parse(event.body)
    const email = body.email
    const password = body.password
    try {
        const { Item: user } = await db.get({
            TableName: usersTable,
            Key: {
                email: email
            }
        }).promise()
        console.log(user)
        if(user) {
            const isEqual = await bcrypt.compare(password, user.password)
            if(isEqual) {
                const token = jwt.sign({
                    id: user.id,
                    email: user.email
                }, process.env.JWT_SECRET, { expiresIn: '1h' })
                return response(200, { message: 'login successfully', token: token })
            }
            else {
                return response(403, { message: 'incorrect credentials' })
            }
        }
        else {
            return response(404, { message: 'User Not Found' })
        }
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.profile = async event => {
    const userEmail = event.requestContext.authorizer.email
    try {
        const { Item: user } = await db.get({
            TableName: usersTable,
            Key: {
                email: userEmail
            }
        }).promise()
        return response(200, {user: user})
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}

exports.updateProfile = async event => {
    const body = JSON.parse(event.body)

    const email = event.requestContext.authorizer.email
    const userId = event.requestContext.authorizer.userId

    try {
        const params = {
            TableName: usersTable,
            Key: {
                email: email
            }
        }
        const { Item: user } = await db.get(params).promise() 
        console.log(user)
        if(!user) {
            return response(404, { message: 'user Not Found' })
        }
        if(user.email !== email && user.id !== userId) {
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
        return response(200, { message: 'user updated' })
    }
    catch(err) {
        console.log(err)
        return response(400, { message: 'Something went wrong!', error: {err} })
    }
}