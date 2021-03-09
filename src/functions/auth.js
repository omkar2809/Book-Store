const AWS = require('aws-sdk')
const bcrypt = require('bcryptjs')
const { v4: uuid } = require('uuid')

const { response } = require('../utils/response')

const db = new AWS.DynamoDB.DocumentClient()

const usersTable = 'users'

exports.signUp = async event => {
    const body = JSON.parse(event.body)
    const email = body.email
    const password = body.password
    try {
        const { Items: users } = await db.scan({
            TableName: usersTable,
            FilterExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email
            }
        }).promise()
        console.log(users)
        if(users.length > 0) {
            return response(400, { message: 'User already exist!' })
        }
        const hashedPassword =  await bcrypt.hash(password, 12)
        const id = uuid()
        await db.put({
            TableName: usersTable,
            Item: {
                id: id,
                email: email,
                password: hashedPassword,
                cart: { items: [] },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        }).promise()
        console.log('User created')
        return response(200, { message: 'User Created' })
    } catch(err) {
        console.log(err)
        return response(500, { message: 'Something went wrong!', error: {err} })
    }
}